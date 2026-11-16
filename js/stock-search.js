/**
 * Stocks 360 - Global Stock Search & Screener.in-Style Detailed Company Analysis (stock-search.js)
 *
 * Features:
 * 1. Global Stock Search positioned right before the Homepage Ask 360 AI drawer
 * 2. Screener.in-style Detailed Company Analysis View:
 *    - Key Fundamental Ratios (Market Cap, P/E, ROE, ROCE, Debt/Equity, Div Yield)
 *    - Technical Indicators (50 DMA, 200 DMA, Golden Cross, Volume Surge)
 *    - Automated AI Pros & Cons Analysis
 *    - 5-Year Financial Performance History Table
 *    - Recent Corporate Announcements & News
 * 3. Browser Voice Audio Readout ("Listen to Company Overview")
 * 4. Strictly Grounded Stocks 360 AI Assistant for the searched company (zero external hallucination)
 */

const ENABLE_PUBLIC_STOCK_SEARCH = true;

document.addEventListener("DOMContentLoaded", function () {
  const searchSection = document.querySelector(".top-search-section");
  if (searchSection) {
    searchSection.hidden = !ENABLE_PUBLIC_STOCK_SEARCH;
  }

  // Purge all legacy AI profile caches so verified comprehensive statements always render cleanly
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("stocks360_gemini_profile_")) {
        localStorage.removeItem(k);
      }
    }
  } catch (_) {}

  const searchInput = document.getElementById("stock-search");
  const searchButton = document.getElementById("search-button");
  const stockResult = document.getElementById("stock-result");
  const quickPills = document.querySelectorAll(".stock-quick-pick");

  let activeCompanyData = null;

  // Starter Quick Pick Pills
  function bindQuickPills() {
    const pills = document.querySelectorAll(".stock-quick-pick");
    pills.forEach((pill) => {
      pill.addEventListener("click", function () {
        const sym = this.getAttribute("data-symbol");
        if (searchInput && sym) {
          searchInput.value = sym;
          performSearch(sym, true);
        }
      });
    });
  }
  bindQuickPills();

  if (searchButton) {
    searchButton.addEventListener("click", () => performSearch(undefined, true));
  }

  // Keyboard navigation on search input is handled below in the suggestions controller

  // Look for URL query param (e.g. index.html?symbol=TCS)
  const urlParams = new URLSearchParams(window.location.search);
  const paramSymbol = urlParams.get("symbol") || urlParams.get("stock");
  if (paramSymbol) {
    if (searchInput) searchInput.value = paramSymbol;
    setTimeout(() => performSearch(paramSymbol, true), 150);
  }

  // ---------------- SEARCH LOGIC & SUGGESTIONS ----------------
  function getStockDataset() {
    if (typeof window !== "undefined" && Array.isArray(window.STOCKS_SCREENER_DATASET) && window.STOCKS_SCREENER_DATASET.length > 0) {
      return window.STOCKS_SCREENER_DATASET;
    }
    if (typeof STOCKS_SCREENER_DATASET !== "undefined" && Array.isArray(STOCKS_SCREENER_DATASET)) {
      return STOCKS_SCREENER_DATASET;
    }
    return [];
  }

  const NOISE_WORDS = new Set([
    "COMPANY", "CO", "LTD", "LIMITED", "CORP", "CORPORATION", "INDIA",
    "THE", "AND", "&", "PVT", "INC", "HOLDINGS"
  ]);

  // Common phonetic / alias substitutions for popular equities
  const COMMON_ALIASES = {
    "EGIS": "AEGIS",
    "AEGISLOGISTICS": "AEGISLOG",
    "INFOSIS": "INFY",
    "RELINCE": "RELIANCE",
    "HDFCBANK": "HDFCBANK",
    "ICICIBANK": "ICICIBANK",
    "TATAMOTORS": "TATAMOTORS",
    "TATAPOWER": "TATAPOWER"
  };

  function cleanAlphanumeric(str) {
    return String(str || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function getQueryTokens(str) {
    return String(str || "")
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !NOISE_WORDS.has(w));
  }

  // Levenshtein distance for fuzzy matching
  function levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  function scoreStock(s, rawQuery) {
    let raw = String(rawQuery || "").trim().toUpperCase();
    if (!raw) return 0;

    // Apply alias substitutions
    for (const [k, v] of Object.entries(COMMON_ALIASES)) {
      if (raw.includes(k)) {
        raw = raw.replace(new RegExp(k, "g"), v);
      }
    }

    const cleanQ = cleanAlphanumeric(raw);
    const symClean = cleanAlphanumeric(s.symbol);
    const nameUpper = String(s.name || "").toUpperCase();
    const cleanName = cleanAlphanumeric(nameUpper);
    const sectorUpper = String(s.sector || "").toUpperCase();

    // 1. Exact Symbol or BSE Scrip Code match -> top priority
    if (symClean === cleanQ) return 1000;
    if (s.bseCode && String(s.bseCode).toUpperCase() === cleanQ) return 950;

    // 2. Symbol starts with clean query (e.g. HS -> HSCL, AEGIS -> AEGISLOG)
    if (symClean.startsWith(cleanQ)) return 850;

    // 3. Exact clean Name match
    if (cleanName === cleanQ) return 800;

    // 4. Name starts with raw query
    if (nameUpper.startsWith(raw)) return 700;

    // 5. Symbol includes clean query (e.g. EGIS in AEGISLOG)
    if (symClean.includes(cleanQ)) return 600;

    // 6. Name contains raw query
    if (nameUpper.includes(raw)) return 500;

    // 7. Multi-token match
    const qTokens = getQueryTokens(raw);
    if (qTokens.length > 0) {
      let matchedCount = 0;
      const combinedTarget = (s.symbol + " " + nameUpper + " " + sectorUpper).toUpperCase();
      const targetWords = combinedTarget.split(/\s+/);

      qTokens.forEach((tk) => {
        const stem = tk.length > 5 ? tk.slice(0, 5) : tk;
        if (combinedTarget.includes(tk) || combinedTarget.includes(stem)) {
          matchedCount++;
          return;
        }
        // Fuzzy token match against target words
        for (const tw of targetWords) {
          if (tw.length >= 4 && tk.length >= 4) {
            const dist = levenshteinDistance(tk, tw);
            if (dist <= 1 || (dist <= 2 && tk.length >= 6)) {
              matchedCount++;
              return;
            }
          }
        }
      });

      const ratio = matchedCount / qTokens.length;
      if (ratio === 1.0) return 450;
      if (ratio >= 0.7) return 300;
      if (ratio >= 0.4) return 150;
    }

    // 8. Fuzzy match for whole query against name words
    if (raw.length >= 4) {
      for (const w of nameUpper.split(/\s+/)) {
        if (w.length >= 4 && levenshteinDistance(raw, w) <= 1) {
          return 350;
        }
      }
    }

    // 9. Sector contains query
    if (sectorUpper.includes(raw)) return 100;

    return 0;
  }

  function findStock(query) {
    const raw = String(query || "").trim();
    if (!raw) return null;
    const dataset = getStockDataset();

    let bestStock = null;
    let highestScore = 0;

    for (const s of dataset) {
      const score = scoreStock(s, raw);
      if (score > highestScore) {
        highestScore = score;
        bestStock = s;
      }
    }

    if (highestScore >= 100) {
      return bestStock;
    }
    return null;
  }

  function getMatchingSuggestions(query, limit = 6) {
    const raw = String(query || "").trim();
    if (!raw || raw.length < 1) return [];
    const dataset = getStockDataset();

    const scored = [];
    for (const s of dataset) {
      const score = scoreStock(s, raw);
      if (score >= 80) {
        scored.push({ stock: s, score: score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((item) => item.stock);
  }

  // Interactive Live Suggestions Dropdown Setup
  let suggestionBox = document.getElementById("stock-search-suggestions");
  if (!suggestionBox && searchInput) {
    suggestionBox = document.createElement("div");
    suggestionBox.id = "stock-search-suggestions";
    suggestionBox.className = "stock-search-suggestions-container";
    suggestionBox.setAttribute("role", "listbox");
    suggestionBox.setAttribute("aria-label", "Stock Search Suggestions");
    suggestionBox.style.cssText = "position:absolute; top:100%; left:0; width:100%; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 12px 28px rgba(0,0,0,0.14); z-index:1000; max-height:300px; overflow-y:auto; margin-top:4px; display:none;";
    
    // Attach suggestion box directly below input element or input container
    const parentContainer = searchInput.parentElement || document.body;
    parentContainer.style.position = "relative";
    parentContainer.appendChild(suggestionBox);
  }

  // Ensure native browser autocomplete does not steal arrow keys or obscure dropdown
  if (searchInput) {
    searchInput.setAttribute("autocomplete", "off");
    searchInput.setAttribute("autocorrect", "off");
    searchInput.setAttribute("autocapitalize", "off");
    searchInput.setAttribute("spellcheck", "false");
    searchInput.setAttribute("aria-autocomplete", "list");
    searchInput.setAttribute("aria-controls", "stock-search-suggestions");
  }

  let currentSuggestions = [];
  let activeSuggestionIndex = -1;
  let originalTypedQuery = "";

  function updateSuggestionHighlight() {
    if (!suggestionBox) return;
    const items = suggestionBox.querySelectorAll(".stock-suggest-item");
    items.forEach((el, idx) => {
      if (idx === activeSuggestionIndex) {
        el.style.background = "#eff6ff";
        el.style.borderLeft = "4px solid #2563eb";
        el.setAttribute("aria-selected", "true");
        el.scrollIntoView({ block: "nearest" });
      } else {
        el.style.background = "#ffffff";
        el.style.borderLeft = "4px solid transparent";
        el.setAttribute("aria-selected", "false");
      }
    });
  }

  function renderSuggestions(query) {
    if (!suggestionBox) return;
    const matches = getMatchingSuggestions(query, 6);
    currentSuggestions = matches;
    activeSuggestionIndex = -1;

    if (matches.length === 0) {
      suggestionBox.style.display = "none";
      suggestionBox.innerHTML = "";
      return;
    }

    suggestionBox.innerHTML = matches
      .map(
        (s, idx) => `
      <div class="stock-suggest-item" data-index="${idx}" data-symbol="${escapeHtml(s.symbol)}" role="option" style="padding:10px 14px; border-bottom:1px solid #f1f5f9; border-left:4px solid transparent; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.15s, border-left 0.15s;">
        <div>
          <span style="font-weight:700; color:#2563eb; font-size:0.95rem; margin-right:8px;">${escapeHtml(s.symbol)}</span>
          <span style="font-size:0.9rem; color:#1e293b;">${escapeHtml(s.name)}</span>
          <div style="font-size:0.78rem; color:#64748b;">${escapeHtml(s.sector)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700; font-size:0.95rem; color:#0f172a;">₹ ${s.cmp.toLocaleString("en-IN")}</div>
          <div style="font-size:0.75rem; color:#16a34a; font-weight:600;">NSE Live</div>
        </div>
      </div>
    `
      )
      .join("");

    suggestionBox.style.display = "block";

    suggestionBox.querySelectorAll(".stock-suggest-item").forEach((item) => {
      item.addEventListener("mouseenter", function () {
        const idx = parseInt(this.getAttribute("data-index"), 10);
        if (!isNaN(idx)) {
          activeSuggestionIndex = idx;
          updateSuggestionHighlight();
        }
      });
      item.addEventListener("click", function () {
        const sym = this.getAttribute("data-symbol");
        selectSuggestion(sym);
      });
    });
  }

  function selectSuggestion(symbol) {
    if (!symbol) return;
    if (searchInput) searchInput.value = symbol;
    if (suggestionBox) {
      suggestionBox.style.display = "none";
      activeSuggestionIndex = -1;
    }
    performSearch(symbol);
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      originalTypedQuery = this.value;
      renderSuggestions(this.value);
    });

    searchInput.addEventListener("focus", function () {
      if (this.value && this.value.trim().length > 0) {
        renderSuggestions(this.value);
      }
    });

    // ArrowDown, ArrowUp, Enter, Escape Navigation with Live Listing Below
    searchInput.addEventListener("keydown", function (e) {
      const isDropdownOpen = suggestionBox && suggestionBox.style.display !== "none" && currentSuggestions.length > 0;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isDropdownOpen) {
          renderSuggestions(this.value);
          if (currentSuggestions.length > 0) {
            activeSuggestionIndex = 0;
            updateSuggestionHighlight();
            const activeStock = currentSuggestions[0];
            if (activeStock) {
              this.value = activeStock.symbol;
              activeCompanyData = activeStock;
              renderDetailedCompanyAnalysis(activeStock);
            }
          }
          return;
        }

        activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
        updateSuggestionHighlight();
        const activeStock = currentSuggestions[activeSuggestionIndex];
        if (activeStock) {
          this.value = activeStock.symbol;
          // Live render the company analysis below as user navigates with arrow keys
          activeCompanyData = activeStock;
          renderDetailedCompanyAnalysis(activeStock);
        }
      } else if (e.key === "ArrowUp") {
        if (!isDropdownOpen) return;
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
        updateSuggestionHighlight();
        const activeStock = currentSuggestions[activeSuggestionIndex];
        if (activeStock) {
          this.value = activeStock.symbol;
          // Live render the company analysis below as user navigates with arrow keys
          activeCompanyData = activeStock;
          renderDetailedCompanyAnalysis(activeStock);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (isDropdownOpen && activeSuggestionIndex >= 0 && activeSuggestionIndex < currentSuggestions.length) {
          const chosen = currentSuggestions[activeSuggestionIndex].symbol;
          selectSuggestion(chosen);
        } else {
          if (suggestionBox) suggestionBox.style.display = "none";
          performSearch(this.value);
        }
      } else if (e.key === "Escape") {
        if (suggestionBox) {
          suggestionBox.style.display = "none";
          activeSuggestionIndex = -1;
        }
        if (originalTypedQuery) {
          this.value = originalTypedQuery;
        }
      }
    });

    document.addEventListener("click", function (e) {
      if (suggestionBox && !searchInput.contains(e.target) && !suggestionBox.contains(e.target)) {
        suggestionBox.style.display = "none";
        activeSuggestionIndex = -1;
      }
    });
  }

  function performSearch(forcedQuery, shouldScroll = true) {
    if (suggestionBox) suggestionBox.style.display = "none";
    const q = (forcedQuery || (searchInput ? searchInput.value : "")).trim();
    if (!q) {
      alert("Please enter a stock name or symbol (e.g. HSCL, Aegis Logistics, TCS, INFY, HDFC Bank, Reliance).");
      if (searchInput) searchInput.focus();
      return;
    }

    const stock = findStock(q);
    if (!stock) {
      activeCompanyData = null;
      if (stockResult) {
        stockResult.removeAttribute("hidden");
        stockResult.hidden = false;
        stockResult.style.display = "block";
        stockResult.innerHTML = `
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:24px; text-align:center;">
            <h3 style="margin:0 0 8px 0; color:#0f172a; font-size:1.2rem;">Stock not found in NSE/BSE directory</h3>
            <p style="margin:0 0 14px 0; color:#64748b; font-size:0.92rem;">No listed equity matched "${escapeHtml(q)}". Try searching by official NSE symbol or BSE company name (e.g. TCS, INFY, HDFC Bank).</p>
            <button type="button" id="btn-notfound-close" class="nav-back-btn primary-back" style="cursor:pointer;">Back to Search</button>
          </div>`;
        const closeBtn = document.getElementById("btn-notfound-close");
        if (closeBtn) closeBtn.addEventListener("click", closeCompanyAnalysis);
      }
      return;
    }

    activeCompanyData = stock;
    try {
      history.pushState({ symbol: stock.symbol }, "", `index.html?symbol=${encodeURIComponent(stock.symbol)}`);
    } catch (_) {}
    renderDetailedCompanyAnalysis(stock, shouldScroll);
  }

  function closeCompanyAnalysis() {
    if (window._stocks360IsSpeakingCompany) {
      if ("speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
      resetListenButtonUI();
    }
    if (stockResult) {
      stockResult.hidden = true;
      stockResult.style.display = "none";
      stockResult.innerHTML = "";
    }
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    try {
      history.pushState({}, "", "index.html");
    } catch (_) {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Visual Statement Table Renderers (Reusable for initial render + verified shard async updates)
  function buildQuarterlyTableHtml(quarterlyResults) {
    if (!Array.isArray(quarterlyResults) || quarterlyResults.length === 0) {
      return `<div style="padding:16px; color:#64748b; background:#f8fafc; border-radius:8px;">Quarterly results pending exchange filing.</div>`;
    }
    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
        <table class="stocks360-data-table" id="company-quarterly-table" style="font-size:0.9rem; width:100%; border-collapse:collapse; min-width:540px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px; text-align:left; border-bottom:1px solid #e2e8f0; font-weight:700;">Metric</th>
              ${quarterlyResults.map(q => `<th style="padding:10px 14px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700;">${escapeHtml(String(q.period))}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600;">Sales / Revenue</td>
              ${quarterlyResults.map(q => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9;">₹ ${escapeHtml(String(q.sales))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">Expenses</td>
              ${quarterlyResults.map(q => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b;">₹ ${escapeHtml(String(q.expenses))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600;">Operating Profit</td>
              ${quarterlyResults.map(q => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:600;">₹ ${escapeHtml(String(q.operatingProfit))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">OPM %</td>
              ${quarterlyResults.map(q => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9;">${escapeHtml(String(q.opm))}</td>`).join('')}
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:700; color:#0f172a;">Net Profit (PAT)</td>
              ${quarterlyResults.map(q => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:700; color:#16a34a;">₹ ${escapeHtml(String(q.netProfit))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px;">EPS in Rs</td>
              ${quarterlyResults.map(q => `<td style="padding:10px 14px; text-align:right;">${escapeHtml(String(q.eps))}</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function buildBalanceSheetTableHtml(balanceSheet) {
    if (!Array.isArray(balanceSheet) || balanceSheet.length === 0) {
      return `<div style="padding:16px; color:#64748b; background:#f8fafc; border-radius:8px;">Balance sheet statements pending exchange filing.</div>`;
    }
    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
        <table class="stocks360-data-table" id="company-balancesheet-table" style="font-size:0.9rem; width:100%; border-collapse:collapse; min-width:540px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px; text-align:left; border-bottom:1px solid #e2e8f0; font-weight:700;">Line Item</th>
              ${balanceSheet.map(b => `<th style="padding:10px 14px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700;">${escapeHtml(String(b.year))}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">Equity Capital</td>
              ${balanceSheet.map(b => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9;">₹ ${escapeHtml(String(b.equityCapital))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">Reserves &amp; Surplus</td>
              ${balanceSheet.map(b => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9;">₹ ${escapeHtml(String(b.reserves))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600;">Borrowings (Debt)</td>
              ${balanceSheet.map(b => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:600; color:${b.borrowings === 'Nil' ? '#16a34a' : '#0f172a'};">${b.borrowings === 'Nil' ? 'Nil' : '₹ ' + escapeHtml(String(b.borrowings))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">Other Liabilities</td>
              ${balanceSheet.map(b => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b;">₹ ${escapeHtml(String(b.otherLiabilities))}</td>`).join('')}
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; font-weight:700;">Total Liabilities</td>
              ${balanceSheet.map(b => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700;">₹ ${escapeHtml(String(b.totalLiabilities))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">Fixed Assets</td>
              ${balanceSheet.map(b => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9;">₹ ${escapeHtml(String(b.fixedAssets))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">Investments</td>
              ${balanceSheet.map(b => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9;">₹ ${escapeHtml(String(b.investments))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">Other Assets</td>
              ${balanceSheet.map(b => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b;">₹ ${escapeHtml(String(b.otherAssets))}</td>`).join('')}
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; font-weight:700;">Total Assets</td>
              ${balanceSheet.map(b => `<td style="padding:10px 14px; text-align:right; font-weight:700;">₹ ${escapeHtml(String(b.totalAssets))}</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function buildCashFlowTableHtml(cashFlows) {
    if (!Array.isArray(cashFlows) || cashFlows.length === 0) {
      return `<div style="padding:16px; color:#64748b; background:#f8fafc; border-radius:8px;">Cash flow statements pending exchange filing.</div>`;
    }
    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
        <table class="stocks360-data-table" id="company-cashflow-table" style="font-size:0.9rem; width:100%; border-collapse:collapse; min-width:540px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px; text-align:left; border-bottom:1px solid #e2e8f0; font-weight:700;">Activity</th>
              ${cashFlows.map(c => `<th style="padding:10px 14px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700;">${escapeHtml(String(c.year))}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; color:#16a34a;">Cash from Operating Activity (CFO)</td>
              ${cashFlows.map(c => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:600; color:#16a34a;">₹ ${escapeHtml(String(c.cfo))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">Cash from Investing Activity (CFI)</td>
              ${cashFlows.map(c => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b;">₹ ${escapeHtml(String(c.cfi))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9;">Cash from Financing Activity (CFF)</td>
              ${cashFlows.map(c => `<td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b;">₹ ${escapeHtml(String(c.cff))}</td>`).join('')}
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; font-weight:700;">Net Cash Flow</td>
              ${cashFlows.map(c => `<td style="padding:10px 14px; text-align:right; font-weight:700;">₹ ${escapeHtml(String(c.netCash ?? c.netCashFlow ?? '--'))}</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function buildShareholdingHtml(shareholding) {
    if (!shareholding || typeof shareholding !== "object" || !shareholding.promoters) {
      return `<div style="padding:16px; color:#64748b; background:#f8fafc; border-radius:8px;">Shareholding pattern pending official exchange filing.</div>`;
    }
    const promStr = String(shareholding.promoters).trim();
    const promNum = parseFloat(promStr);
    const pubStr = shareholding.public && shareholding.public !== "--"
      ? String(shareholding.public).trim()
      : (!isNaN(promNum) ? Math.max(0, Number((100 - promNum).toFixed(2))).toFixed(2) + "%" : "--");
    const promWidth = !isNaN(promNum) ? Math.max(0, Math.min(100, promNum)) + "%" : "0%";

    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:14px;">
        <table class="stocks360-data-table" id="company-shareholding-table" style="font-size:0.9rem; width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px; text-align:left; border-bottom:1px solid #e2e8f0; font-weight:700;">Shareholder Category</th>
              <th style="padding:10px 14px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700;">Latest Official Filing</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600;">
                <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#2563eb; margin-right:8px;"></span>Promoters &amp; Promoter Group
              </td>
              <td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:600; color:#0f172a;">${escapeHtml(promStr)}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600;">
                <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#64748b; margin-right:8px;"></span>Public Shareholders (Institutional &amp; Retail)
              </td>
              <td style="padding:10px 14px; text-align:right; border-bottom:1px solid #f1f5f9; color:#475569;">${escapeHtml(pubStr)}</td>
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; font-weight:700; color:#0f172a;">Total Shareholding</td>
              <td style="padding:10px 14px; text-align:right; font-weight:700; color:#0f172a;">100.00%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px;">
        <div style="height:12px; border-radius:6px; overflow:hidden; display:flex; background:#94a3b8;">
          <div style="width:${escapeHtml(promWidth)}; background:#2563eb;" title="Promoters: ${escapeHtml(promStr)}"></div>
        </div>
      </div>
    `;
  }

  function buildStockPeerComparisonHtml(stock) {
    const dataset = getStockDataset();
    const targetSector = String(stock.sector || "").trim().toLowerCase();
    const primarySectorWord = targetSector.split(/[\s/&,-]+/).filter((w) => w.length >= 3)[0] || "";

    // Find same-sector peers
    let sameSector = dataset.filter(
      (s) => s && s.symbol && String(s.sector || "").trim().toLowerCase() === targetSector
    );

    if (sameSector.length < 5 && primarySectorWord) {
      const broader = dataset.filter(
        (s) => s && s.symbol && String(s.sector || "").toLowerCase().includes(primarySectorWord)
      );
      const seenSyms = new Set(sameSector.map((x) => x.symbol));
      broader.forEach((b) => {
        if (!seenSyms.has(b.symbol)) {
          seenSyms.add(b.symbol);
          sameSector.push(b);
        }
      });
    }

    // Sort by Volume descending so actively traded sector peers appear cleanly
    sameSector.sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0));

    // Take top 7 peers + ensure current stock is always included in the table
    const topPeers = [];
    const included = new Set();
    for (const p of sameSector) {
      if (topPeers.length >= 7 && p.symbol !== stock.symbol) continue;
      if (!included.has(p.symbol)) {
        included.add(p.symbol);
        topPeers.push(p.symbol === stock.symbol ? stock : p);
      }
      if (topPeers.length >= 8) break;
    }

    if (!included.has(stock.symbol)) {
      topPeers.push(stock);
    }

    topPeers.sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0));

    function avgMetric(list, getter, digits, positiveOnly) {
      const vals = list.map(getter).filter((v) => typeof v === "number" && !isNaN(v) && (!positiveOnly || v > 0));
      if (vals.length === 0) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return digits === 0 ? Math.round(avg) : avg.toFixed(digits);
    }
    const avgCmp = avgMetric(topPeers, (p) => (p.cmp !== undefined && p.cmp !== null ? Number(p.cmp) : NaN), 2, true);
    const avgChg = avgMetric(topPeers, (p) => (p.dayChangePct !== undefined && p.dayChangePct !== null ? Number(p.dayChangePct) : NaN), 2, false);
    const avgDma50 = avgMetric(topPeers, (p) => (p.dma50 !== undefined && p.dma50 !== null ? Number(p.dma50) : NaN), 2, true);
    const avgDma200 = avgMetric(topPeers, (p) => (p.dma200 !== undefined && p.dma200 !== null ? Number(p.dma200) : NaN), 2, true);
    const avgRsi = avgMetric(topPeers, (p) => (p.rsi14 !== undefined && p.rsi14 !== null ? Number(p.rsi14) : NaN), 1, true);
    const avgVol = avgMetric(topPeers, (p) => (p.volume !== undefined && p.volume !== null ? Number(p.volume) : NaN), 0, true);

    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
        <table id="company-peers-table" style="width:100%; border-collapse:collapse; font-size:0.86rem; min-width:860px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left;">
              <th style="padding:10px 12px; color:#1e293b; font-weight:700; width:46px;">S.No.</th>
              <th style="padding:10px 14px; color:#1e293b; font-weight:700;">Company Name</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700;">Exchange</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700; text-align:right;">CMP (₹)</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700; text-align:right;">Day Change %</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700; text-align:right;">52W High (₹)</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700; text-align:right;">52W Low (₹)</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700; text-align:right;">50-DMA (₹)</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700; text-align:right;">200-DMA (₹)</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700; text-align:right;">14-Day RSI</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700; text-align:right;">Volume</th>
            </tr>
          </thead>
          <tbody>
            ${topPeers
              .map((p, idx) => {
                const isCurrent = p.symbol === stock.symbol;
                const pCmp = Number(p.cmp) || 0;
                const pChg = typeof p.dayChangePct === "number" && !isNaN(p.dayChangePct) ? p.dayChangePct : null;
                const pH52 = Number(p.high52) > 0 ? "₹ " + Number(p.high52).toLocaleString("en-IN") : "--";
                const pL52 = Number(p.low52) > 0 ? "₹ " + Number(p.low52).toLocaleString("en-IN") : "--";
                const pDma50 = Number(p.dma50) > 0 ? "₹ " + Number(p.dma50).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
                const pDma200 = Number(p.dma200) > 0 ? "₹ " + Number(p.dma200).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
                const pRsi = typeof p.rsi14 === "number" && p.rsi14 > 0 ? Number(p.rsi14).toFixed(1) : "--";
                const pVol = Number(p.volume) > 0 ? Number(p.volume).toLocaleString("en-IN") : "--";
                const pExch = p.exchanges || (p.bseCode ? "NSE,BSE" : "NSE");
                const chgColor = pChg === null ? "#64748b" : (pChg >= 0 ? "#16a34a" : "#dc2626");
                const chgText = pChg === null ? "--" : `${pChg >= 0 ? "+" : ""}${pChg.toFixed(2)}%`;
                return `
                  <tr style="background:${isCurrent ? "#eff6ff" : idx % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px; color:#64748b; font-weight:600;">${idx + 1}.</td>
                    <td style="padding:10px 14px;">
                      <a href="index.html?symbol=${encodeURIComponent(p.symbol)}" class="stock-peer-link" data-symbol="${escapeHtml(p.symbol)}" style="color:${isCurrent ? "#1d4ed8" : "#2563eb"}; font-weight:${isCurrent ? "800" : "700"}; text-decoration:none;">
                        ${escapeHtml(p.name)}
                      </a>
                      <span style="font-size:0.75rem; color:#64748b; margin-left:6px;">(${escapeHtml(p.symbol)})</span>
                    </td>
                    <td style="padding:10px 12px; color:#475569; font-size:0.78rem; font-weight:600;">${escapeHtml(pExch)}</td>
                    <td style="padding:10px 12px; text-align:right; font-weight:700; color:#0f172a;">₹ ${pCmp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding:10px 12px; text-align:right; font-weight:700; color:${chgColor};">${chgText}</td>
                    <td style="padding:10px 12px; text-align:right; color:#334155;">${pH52}</td>
                    <td style="padding:10px 12px; text-align:right; color:#334155;">${pL52}</td>
                    <td style="padding:10px 12px; text-align:right; color:#334155;">${pDma50}</td>
                    <td style="padding:10px 12px; text-align:right; color:#334155;">${pDma200}</td>
                    <td style="padding:10px 12px; text-align:right; font-weight:600; color:#0f172a;">${pRsi}</td>
                    <td style="padding:10px 12px; text-align:right; color:#475569;">${pVol}</td>
                  </tr>
                `;
              })
              .join("")}
            <tr style="background:#f8fafc; border-top:2px solid #cbd5e1; font-weight:700;">
              <td style="padding:10px 12px; color:#64748b;">—</td>
              <td style="padding:10px 14px; color:#0f172a;">Sector Average (${escapeHtml(stock.sector || "Peers")})</td>
              <td style="padding:10px 12px; color:#64748b;">—</td>
              <td style="padding:10px 12px; text-align:right; color:#0f172a;">${avgCmp !== null ? "₹ " + Number(avgCmp).toLocaleString("en-IN") : "--"}</td>
              <td style="padding:10px 12px; text-align:right; color:${avgChg !== null && Number(avgChg) >= 0 ? "#16a34a" : "#dc2626"};">${avgChg !== null ? (Number(avgChg) >= 0 ? "+" : "") + avgChg + "%" : "--"}</td>
              <td style="padding:10px 12px; text-align:right; color:#64748b;">—</td>
              <td style="padding:10px 12px; text-align:right; color:#64748b;">—</td>
              <td style="padding:10px 12px; text-align:right; color:#0f172a;">${avgDma50 !== null ? "₹ " + Number(avgDma50).toLocaleString("en-IN") : "--"}</td>
              <td style="padding:10px 12px; text-align:right; color:#0f172a;">${avgDma200 !== null ? "₹ " + Number(avgDma200).toLocaleString("en-IN") : "--"}</td>
              <td style="padding:10px 12px; text-align:right; color:#0f172a;">${avgRsi !== null ? avgRsi : "--"}</td>
              <td style="padding:10px 12px; text-align:right; color:#0f172a;">${avgVol !== null ? avgVol.toLocaleString("en-IN") : "--"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ---------------- VERIFIED REAL COMPANY PROFILES & STATEMENTS ----------------
  // Official company descriptions, websites, and audited multi-year financials
  // fetched from official exchange data feeds into data/profiles/<first-letter>.json (Rs 0 cost).
  const profileShardCache = {};

  function loadVerifiedProfile(symbol) {
    const key = newsShardKey(symbol);
    if (!profileShardCache[key]) {
      profileShardCache[key] = fetch("data/profiles/" + encodeURIComponent(key) + ".json?v=62")
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({}));
    }
    return profileShardCache[key].then((shard) => (shard && shard[String(symbol).toUpperCase()]) || null);
  }

  const bseShardCache = {};

  function loadBseQuote(symbol) {
    const key = newsShardKey(symbol);
    if (!bseShardCache[key]) {
      bseShardCache[key] = fetch("data/bse/" + encodeURIComponent(key) + ".json?v=62")
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({}));
    }
    return bseShardCache[key].then((shard) => (shard && shard[String(symbol).toUpperCase()]) || null);
  }

  // ---------------- REAL CORPORATE NEWS & ANNOUNCEMENTS ----------------
  // Announcements come from the official NSE feed, synced daily by
  // scripts/update-nse-news.js into data/news/<first-letter>.json (no AI cost).
  const newsShardCache = {};

  function newsShardKey(symbol) {
    const c = String(symbol || "").charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : "0-9";
  }

  function loadCompanyNews(symbol) {
    const key = newsShardKey(symbol);
    if (!newsShardCache[key]) {
      newsShardCache[key] = fetch("data/news/" + encodeURIComponent(key) + ".json?v=62")
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({}));
    }
    return newsShardCache[key].then((shard) => (shard && shard[String(symbol).toUpperCase()]) || []);
  }

  function renderNewsItems(items, stock) {
    if (!items || items.length === 0) {
      const nseUrl = "https://www.nseindia.com/get-quotes/equity?symbol=" + encodeURIComponent(stock.symbol);
      return `
        <div style="padding:14px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:0.93rem; color:#475569;">
          No exchange announcements filed by ${escapeHtml(stock.name)} in the last 90 days.
          <a href="${nseUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb; font-weight:600;">View on NSE</a>
        </div>`;
    }
    return items
      .map((n) => {
        const safeLink = n.link && /^https:\/\/(nsearchives\.nseindia\.com|www\.nseindia\.com)\//.test(n.link) ? n.link : "";
        const headline = escapeHtml(n.headline);
        return `
        <div style="padding:12px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="flex:1; min-width:240px;">
            <span class="badge badge-neutral" style="font-size:0.75rem; margin-right:8px;">${escapeHtml(n.category || "Announcement")}</span>
            ${safeLink
              ? `<a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="font-size:0.93rem; color:#1e293b; font-weight:600; text-decoration:none;">${headline}</a>`
              : `<span style="font-size:0.93rem; color:#1e293b; font-weight:600;">${headline}</span>`}
          </div>
          <span style="font-size:0.8rem; color:#64748b;">${escapeHtml(n.source || "NSE Filing")} &bull; ${escapeHtml(n.date || "")}</span>
        </div>`;
      })
      .join("");
  }

  // Gemini / shared-cache text is untrusted: render as escaped paragraphs, never raw HTML.
  function formatProfileAbout(text) {
    return String(text || "")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p style="margin:0 0 12px 0;">${escapeHtml(p)}</p>`)
      .join("");
  }

  // ---------------- RENDER COMPLETE DETAILED VIEW ----------------
  function renderDetailedCompanyAnalysis(stock, shouldScroll = true) {
    if (!stock || !stockResult) return;
    stockResult.removeAttribute("hidden");
    stockResult.hidden = false;
    stockResult.style.display = "block";

    const isBseOnly = stock.exchanges === "BSE";



    // 2. Comprehensive Financial Statements Suites (Official Exchange Filings Only - No Synthetic Numbers)
    const quarterlyResults = (!isBseOnly && Array.isArray(stock.quarterlyResults)) ? stock.quarterlyResults : [];
    const balanceSheet = (!isBseOnly && Array.isArray(stock.balanceSheet)) ? stock.balanceSheet : [];
    const cashFlows = (!isBseOnly && Array.isArray(stock.cashFlows)) ? stock.cashFlows : [];
    const shareholding = (!isBseOnly && stock.shareholding && typeof stock.shareholding === "object") ? stock.shareholding : null;

    // 3. About the Company Profile Text
    const aboutText = stock.about
      ? (typeof stock.about === "string" && stock.about.includes("<p>") ? stock.about : formatProfileAbout(stock.about))
      : `<strong>${escapeHtml(stock.name)}</strong> is an equity security listed on ${isBseOnly ? "BSE Ltd" : "NSE"} in the <strong>${escapeHtml(stock.sector)}</strong> sector.`;

    const initialNews = (!isBseOnly && Array.isArray(stock.news) && stock.news.length > 0) ? stock.news : null;

    // 5. Authentic Exchange OHLC & 52-Week Range metrics (zero synthetic multipliers)
    const dayOpen = (typeof stock.dayOpen === "number" && stock.dayOpen > 0) ? stock.dayOpen : ((typeof stock.open === "number" && stock.open > 0) ? stock.open : stock.cmp);
    const dayHigh = (typeof stock.dayHigh === "number" && stock.dayHigh > 0) ? stock.dayHigh : stock.cmp;
    const dayLow = (typeof stock.dayLow === "number" && stock.dayLow > 0) ? stock.dayLow : stock.cmp;
    const high52 = (typeof stock.high52 === "number" && stock.high52 > 0) ? stock.high52 : dayHigh;
    const low52 = (typeof stock.low52 === "number" && stock.low52 > 0) ? stock.low52 : dayLow;

    const dayChange = typeof stock.dayChange === "number" ? stock.dayChange : 0;
    const dayChangePct = typeof stock.dayChangePct === "number" ? stock.dayChangePct : 0;
    const isGain = stock.isGain !== undefined ? stock.isGain : dayChange >= 0;
    const prevClose = (typeof stock.prevClose === "number" && stock.prevClose > 0) ? stock.prevClose : Number((stock.cmp - dayChange).toFixed(2));
    const dayPerformanceText = isGain
      ? `+ ₹${Math.abs(dayChange).toFixed(2)} (+${Math.abs(dayChangePct)}%) Day Gain`
      : `- ₹${Math.abs(dayChange).toFixed(2)} (-${Math.abs(dayChangePct)}%) Day Loss`;

    stockResult.innerHTML = `
      <div class="company-detail-card" style="background:#ffffff; border-radius:14px; border:1px solid #e2e8f0; padding:24px; box-shadow:0 2px 12px rgba(0,0,0,0.06); font-family:inherit;">
        
        <!-- FOCUSED BACK NAVIGATION BAR (v62) -->
        <div class="focused-nav-bar" role="navigation" aria-label="Company analysis navigation">
          <div class="focused-nav-group">
            <button type="button" id="btn-back-to-home-search" class="nav-back-btn primary-back" aria-label="Go back to Home and stock search">
              <span aria-hidden="true">&#8592;</span> Go Back to Home &amp; Stock Search
            </button>
          </div>
          <span class="focused-nav-hint">Press Esc or click back to return</span>
        </div>

        <!-- HEADER & LIVE QUOTE BAR -->
        <div class="company-price-header" style="margin-bottom:20px; padding-bottom:18px; border-bottom:1px solid #e2e8f0;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span id="company-exchange-badge" class="badge badge-success" style="font-size:0.75rem; background:${stock.exchanges === 'BSE' ? '#2563eb' : '#10b981'}; color:#ffffff; padding:3px 8px; border-radius:4px; font-weight:700;">${stock.exchanges === 'BSE' ? `BSE: ${escapeHtml(stock.bseCode || stock.symbol)}` : `NSE: ${escapeHtml(stock.symbol)}`}</span>
                <span style="font-size:0.85rem; color:#64748b; font-weight:600;">${escapeHtml(stock.sector)}</span>
                <a id="company-official-website-link" href="${stock.website ? escapeHtml(stock.website) : '#'}" target="_blank" rel="noopener noreferrer" style="display:${stock.website ? 'inline-flex' : 'none'}; font-size:0.8rem; color:#2563eb; font-weight:600; text-decoration:none; padding:2px 8px; border-radius:4px; background:#eff6ff; border:1px solid #bfdbfe;">
                  Official Website ↗
                </a>
              </div>
              <h2 id="company-view-title" style="margin:8px 0 4px 0; font-size:1.75rem; color:#0f172a; font-weight:800;">${escapeHtml(stock.name)}</h2>
              
              <div style="display:flex; align-items:baseline; gap:12px; margin-top:6px; flex-wrap:wrap;">
                <span id="company-hero-cmp" style="font-size:2.1rem; font-weight:800; color:#0f172a;">₹ ${stock.cmp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                <span id="company-hero-day-pill" class="price-performance-pill" style="font-size:1.02rem; font-weight:700; padding:4px 12px; border-radius:6px; background:${isGain ? "#f0fdf4" : "#fef2f2"}; color:${isGain ? "#16a34a" : "#dc2626"}; border:1px solid ${isGain ? "#bbf7d0" : "#fecaca"};">
                  ${dayPerformanceText}
                </span>
                <span id="company-hero-session" style="font-size:0.82rem; color:#64748b;">(Session: ${escapeHtml(stock.lastUpdated || "Today, 3:30 PM IST")})</span>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
              <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                <button type="button" class="btn-secondary" id="btn-listen-company" aria-pressed="false" style="font-weight:700; padding:10px 16px; font-size:0.92rem; border-radius:8px; cursor:pointer;">
                  Listen to About the Company
                </button>
              </div>
              ${!isBseOnly ? `<div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                <a id="btn-annual-report-header" href="${stock.latestAnnualReportUrl ? escapeHtml(stock.latestAnnualReportUrl) : `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(stock.symbol)}`}" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem; font-weight:700; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; padding:5px 12px; border-radius:6px; text-decoration:none;">
                  ${stock.latestAnnualReportUrl ? 'View Latest Annual Report PDF ↗' : 'View Official Annual Report &amp; NSE Filings ↗'}
                </a>
                <a href="https://www.nseindia.com/companies-listing/corporate-filings-annual-reports" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem; font-weight:600; color:#334155; background:#f8fafc; border:1px solid #cbd5e1; padding:5px 12px; border-radius:6px; text-decoration:none;">
                  NSE Annual Reports Archive ↗
                </a>
              </div>` : ''}
            </div>
          </div>
        </div>

        <!-- EXCHANGE SWITCHER (NSE / BSE) -->
        <div id="exchange-switcher-bar" role="group" aria-label="Switch Stock Exchange" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:0.85rem; font-weight:700; color:#334155;">Exchange View:</span>
            <button type="button" id="btn-exchange-nse" data-exchange="NSE" aria-pressed="${stock.exchanges !== 'BSE' ? 'true' : 'false'}" ${stock.exchanges === 'BSE' ? 'disabled title="Not listed on NSE"' : ''} style="padding:6px 14px; font-size:0.84rem; font-weight:700; border-radius:6px; cursor:${stock.exchanges === 'BSE' ? 'not-allowed' : 'pointer'}; border:1px solid ${stock.exchanges !== 'BSE' ? '#0f172a' : '#cbd5e1'}; background:${stock.exchanges !== 'BSE' ? '#0f172a' : '#ffffff'}; color:${stock.exchanges !== 'BSE' ? '#ffffff' : '#64748b'}; opacity:${stock.exchanges === 'BSE' ? '0.5' : '1'};">
              NSE (${escapeHtml(stock.symbol)})
            </button>
            <button type="button" id="btn-exchange-bse" data-exchange="BSE" aria-pressed="${stock.exchanges === 'BSE' ? 'true' : 'false'}" ${!stock.bseCode ? 'disabled title="Loading BSE data..."' : ''} style="padding:6px 14px; font-size:0.84rem; font-weight:700; border-radius:6px; cursor:${stock.bseCode ? 'pointer' : 'not-allowed'}; border:1px solid ${stock.exchanges === 'BSE' ? '#2563eb' : '#cbd5e1'}; background:${stock.exchanges === 'BSE' ? '#2563eb' : '#ffffff'}; color:${stock.exchanges === 'BSE' ? '#ffffff' : '#334155'}; opacity:${stock.bseCode ? '1' : '0.55'};">
              BSE ${stock.bseCode ? `(${escapeHtml(stock.bseCode)})` : ''}
            </button>
          </div>
          <span id="exchange-switcher-status" style="font-size:0.78rem; color:#64748b;">${stock.exchanges === 'BSE' ? 'Exchange: BSE' : 'Exchange: NSE'}</span>
        </div>

        <!-- SECTION 1: PRICE PERFORMANCE -->
        <section id="sec-price" style="margin-bottom:28px;">
          <h3 style="font-size:1.25rem; color:#0f172a; margin-bottom:14px; font-weight:700;">Price Performance</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px;">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Today Open</span>
              <strong id="pp-open" style="font-size:0.92rem; color:#0f172a;">₹ ${dayOpen.toLocaleString("en-IN")}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Today High</span>
              <strong id="pp-high" style="font-size:0.92rem; color:#16a34a;">₹ ${dayHigh.toLocaleString("en-IN")}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Today Low</span>
              <strong id="pp-low" style="font-size:0.92rem; color:#dc2626;">₹ ${dayLow.toLocaleString("en-IN")}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Previous Close</span>
              <strong id="pp-prev-close" style="font-size:0.92rem; color:#0f172a;">₹ ${prevClose.toLocaleString("en-IN")}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">52-Week High</span>
              <strong id="pp-high52" style="font-size:0.92rem; color:#16a34a;">₹ ${high52.toLocaleString("en-IN")}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">52-Week Low</span>
              <strong id="pp-low52" style="font-size:0.92rem; color:#dc2626;">₹ ${low52.toLocaleString("en-IN")}</strong>
            </div>
          </div>
        </section>

        <!-- TRADINGVIEW CHART LINKS -->
        <section id="sec-live-chart" style="margin-bottom:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:14px 18px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
            <h3 style="font-size:1.2rem; color:#0f172a; margin:0; font-weight:700;">TradingView Chart</h3>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              ${stock.exchanges !== 'BSE' ? `<a id="tv-btn-open-nse" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent('NSE:' + stock.symbol)}" target="_blank" rel="noopener noreferrer" style="padding:8px 14px; font-size:0.85rem; font-weight:700; color:#ffffff; background:#2563eb; border:1px solid #2563eb; border-radius:7px; text-decoration:none;">See TradingView Chart in NSE</a>` : ''}
              <a id="tv-btn-open-bse" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent('BSE:' + (stock.bseCode || stock.symbol))}" target="_blank" rel="noopener noreferrer" style="padding:8px 14px; font-size:0.85rem; font-weight:700; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:7px; text-decoration:none;${stock.exchanges === 'BSE' || stock.bseCode ? '' : ' display:none;'}">See TradingView Chart in BSE</a>
            </div>
          </div>
        </section>

        <!-- SECTION 3: TECHNICALS -->
        <section id="sec-technicals" style="margin-bottom:28px;">
          <h3 style="font-size:1.25rem; color:#0f172a; margin-bottom:14px; font-weight:700;">Technicals</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">50-DMA</span>
              <strong style="font-size:0.92rem; color:#0f172a;">₹ ${stock.dma50.toLocaleString("en-IN")}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">200-DMA</span>
              <strong style="font-size:0.92rem; color:#0f172a;">₹ ${stock.dma200.toLocaleString("en-IN")}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Golden Crossover</span>
              <strong style="font-size:0.92rem; color:${stock.goldenCross ? '#16a34a' : '#64748b'};">${stock.goldenCross ? 'Active Bullish' : 'Neutral'}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">14-Day RSI</span>
              <strong style="font-size:0.92rem; color:#0f172a;">${stock.rsi14}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Volume Surge</span>
              <strong style="font-size:0.92rem; color:#0f172a;">${stock.volumeSurge}x</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Trading Volume</span>
              <strong style="font-size:0.92rem; color:#0f172a;">${typeof stock.volume === "number" && stock.volume > 0 ? stock.volume.toLocaleString("en-IN") : "Active"}</strong>
            </div>
          </div>
        </section>

        <!-- SECTION 4: ABOUT THE COMPANY -->
        <section id="sec-about" style="margin-bottom:28px;">
          <h3 style="font-size:1.25rem; color:#0f172a; margin-bottom:14px; font-weight:700;">About the Company</h3>
          <div id="company-about-content" style="font-size:0.95rem; color:#334155; line-height:1.7;">
            ${aboutText}
          </div>
          <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
            ${!isBseOnly ? `<a id="btn-annual-report-about" href="${stock.latestAnnualReportUrl ? escapeHtml(stock.latestAnnualReportUrl) : `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(stock.symbol)}`}" target="_blank" rel="noopener noreferrer" style="font-size:0.84rem; font-weight:700; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; padding:6px 12px; border-radius:6px; text-decoration:none;">${stock.latestAnnualReportUrl ? `Official Latest Annual Report PDF (${escapeHtml(stock.symbol)}) ↗` : `Official Annual Report &amp; NSE Corporate Filings (${escapeHtml(stock.symbol)}) ↗`}</a>` : ''}
            <a id="about-official-website-link" href="${stock.website ? escapeHtml(stock.website) : '#'}" target="_blank" rel="noopener noreferrer" style="display:${stock.website ? 'inline-flex' : 'none'}; font-size:0.84rem; font-weight:600; color:#334155; background:#f8fafc; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; text-decoration:none;">
              Official Company Website ↗
            </a>
          </div>
        </section>

        <!-- SECTION 5: NEWS AND CORPORATE FILINGS -->
        <section id="sec-filings" ${isBseOnly ? 'hidden' : ''} style="margin-bottom:28px;">
          <h3 style="font-size:1.25rem; color:#0f172a; margin-bottom:14px; font-weight:700;">News and Corporate Filings</h3>
          <div id="company-news-list" style="display:flex; flex-direction:column; gap:10px;">
            ${initialNews
              ? renderNewsItems(initialNews, stock)
              : `<div style="padding:12px 16px; font-size:0.9rem; color:#64748b; background:#f8fafc; border-radius:8px;">Loading latest NSE announcements...</div>`}
          </div>
        </section>

        <!-- SECTION 6: FINANCIALS (OFFICIAL EXCHANGE FILINGS ONLY) -->
        <section id="sec-financials" ${isBseOnly ? 'hidden' : ''} style="margin-bottom:24px;">
          <h3 style="font-size:1.25rem; color:#0f172a; margin-bottom:16px; font-weight:700; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">Financials</h3>

          <!-- 6.1: QUARTERLY RESULTS -->
          <div id="sec-quarterly" style="margin-bottom:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Quarterly Results (₹ Crores)</h4>
            <div id="company-quarterly-container">
              ${buildQuarterlyTableHtml(quarterlyResults)}
            </div>
          </div>

          <!-- 6.2: BALANCE SHEET -->
          <div id="sec-balancesheet" style="margin-bottom:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Balance Sheet (₹ Crores)</h4>
            <div id="company-balancesheet-container">
              ${buildBalanceSheetTableHtml(balanceSheet)}
            </div>
          </div>

          <!-- 6.3: CASH FLOWS -->
          <div id="sec-cashflow" style="margin-bottom:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Cash Flows (₹ Crores)</h4>
            <div id="company-cashflow-container">
              ${buildCashFlowTableHtml(cashFlows)}
            </div>
          </div>

          <!-- 6.4: SHAREHOLDING PATTERN -->
          <div id="sec-shareholding" style="margin-bottom:12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Shareholding Pattern</h4>
            <div id="company-shareholding-container">
              ${buildShareholdingHtml(shareholding)}
            </div>
          </div>
        </section>

        <!-- SECTION 7: PEER COMPARISON -->
        <section id="sec-peers" style="margin-bottom:12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
          <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Peer Comparison (${escapeHtml(stock.sector || "Sector Peers")})</h4>
          <div id="company-peers-container">
            ${buildStockPeerComparisonHtml(stock)}
          </div>
        </section>

      </div>
    `;

    // Delegated click handler for Ratio Information toggle buttons and Peer Company Links
    if (!stockResult.dataset.ratioInfoBound) {
      stockResult.dataset.ratioInfoBound = "true";
      stockResult.addEventListener("click", function (e) {
        const peerLink = e.target.closest(".stock-peer-link");
        if (peerLink) {
          const sym = peerLink.getAttribute("data-symbol");
          if (sym && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            if (searchInput) searchInput.value = sym;
            performSearch(sym, true);
          }
          return;
        }

        const btn = e.target.closest(".ratio-info-toggle-btn");
        if (!btn) return;
        e.preventDefault();
        const box = btn.nextElementSibling;
        if (!box || !box.classList.contains("ratio-info-box")) return;
        const isHidden = box.hasAttribute("hidden");
        if (isHidden) {
          box.removeAttribute("hidden");
          btn.setAttribute("aria-expanded", "true");
          box.setAttribute("tabindex", "-1");
          if (typeof window.speakText === "function" && localStorage.getItem("stocks360_special_a11y") === "true") {
            window.speakText(box.textContent, true);
          }
        } else {
          box.setAttribute("hidden", "");
          btn.setAttribute("aria-expanded", "false");
        }
      });

      // Keyboard handler: collapse ratio information box when Escape is pressed
      stockResult.addEventListener("keydown", function (e) {
        if (e.key === "Escape" || e.key === "Esc") {
          const activeEl = document.activeElement;
          if (activeEl) {
            const openBox = activeEl.closest(".ratio-info-box");
            if (openBox && !openBox.hasAttribute("hidden")) {
              e.preventDefault();
              openBox.setAttribute("hidden", "");
              const toggleBtn = openBox.previousElementSibling;
              if (toggleBtn && toggleBtn.classList.contains("ratio-info-toggle-btn")) {
                toggleBtn.setAttribute("aria-expanded", "false");
                toggleBtn.focus();
              }
              return;
            }
            if (activeEl.classList && activeEl.classList.contains("ratio-info-toggle-btn") && activeEl.getAttribute("aria-expanded") === "true") {
              e.preventDefault();
              activeEl.setAttribute("aria-expanded", "false");
              const nextBox = activeEl.nextElementSibling;
              if (nextBox && nextBox.classList.contains("ratio-info-box")) {
                nextBox.setAttribute("hidden", "");
              }
              return;
            }
          }
          e.preventDefault();
          closeCompanyAnalysis();
        }
      });
    }

    // Helper to apply Verified profile data to DOM elements live
    function applyVerifiedProfileToView(profile) {
      if (!profile) return;
      if (!activeCompanyData || activeCompanyData.symbol !== stock.symbol) return;

      const aboutEl = document.getElementById("company-about-content");
      if (aboutEl && profile.about) {
        aboutEl.innerHTML = formatProfileAbout(profile.about);
      }

      if (profile.website) {
        const siteLinkEl = document.getElementById("company-official-website-link");
        if (siteLinkEl) {
          siteLinkEl.href = profile.website;
          siteLinkEl.style.display = "inline-flex";
        }
        const aboutSiteEl = document.getElementById("about-official-website-link");
        if (aboutSiteEl) {
          aboutSiteEl.href = profile.website;
          aboutSiteEl.style.display = "inline-flex";
        }
      }


      if (Array.isArray(profile.quarterlyResults) && profile.quarterlyResults.length > 0) {
        const qContainer = document.getElementById("company-quarterly-container");
        if (qContainer) qContainer.innerHTML = buildQuarterlyTableHtml(profile.quarterlyResults);
      }
      if (Array.isArray(profile.balanceSheet) && profile.balanceSheet.length > 0) {
        const bContainer = document.getElementById("company-balancesheet-container");
        if (bContainer) bContainer.innerHTML = buildBalanceSheetTableHtml(profile.balanceSheet);
      }
      if (Array.isArray(profile.cashFlows) && profile.cashFlows.length > 0) {
        const cContainer = document.getElementById("company-cashflow-container");
        if (cContainer) cContainer.innerHTML = buildCashFlowTableHtml(profile.cashFlows);
      }
      if (profile.shareholding && typeof profile.shareholding === "object") {
        const shContainer = document.getElementById("company-shareholding-container");
        if (shContainer) shContainer.innerHTML = buildShareholdingHtml(profile.shareholding);
      }
      const peersContainer = document.getElementById("company-peers-container");
      if (peersContainer) peersContainer.innerHTML = buildStockPeerComparisonHtml(stock);
    }

    // Load official verified profile shard (audited statements, balance sheet, cash flows, ratios, shareholding)
    if (!isBseOnly) loadVerifiedProfile(stock.symbol).then((verified) => {
      if (verified) {
        Object.keys(verified).forEach((k) => {
          if (verified[k] !== null && verified[k] !== undefined) {
            stock[k] = verified[k];
          }
        });
        if (activeCompanyData && activeCompanyData.symbol === stock.symbol) {
          applyVerifiedProfileToView(verified);
        }
      }
    });

    // NSE / BSE Exchange Switcher (loads official BSE Bhavcopy quote on demand)
    const nseQuoteSnapshot = {
      cmp: stock.cmp,
      dayOpen,
      dayHigh,
      dayLow,
      prevClose,
      dayChange,
      dayChangePct,
      isGain,
      high52,
      low52,
      lastUpdated: stock.lastUpdated || "Today, 3:30 PM IST"
    };
    let bseQuoteSnapshot = null;

    function applyExchangeQuote(exch) {
      const q = exch === "BSE" && bseQuoteSnapshot ? bseQuoteSnapshot : nseQuoteSnapshot;
      const badgeEl = document.getElementById("company-exchange-badge");
      const cmpEl = document.getElementById("company-hero-cmp");
      const pillEl = document.getElementById("company-hero-day-pill");
      const sessEl = document.getElementById("company-hero-session");
      const openEl = document.getElementById("pp-open");
      const highEl = document.getElementById("pp-high");
      const lowEl = document.getElementById("pp-low");
      const prevEl = document.getElementById("pp-prev-close");
      const h52El = document.getElementById("pp-high52");
      const l52El = document.getElementById("pp-low52");
      const curPriceEl = document.getElementById("metric-current-price");
      const statusEl = document.getElementById("exchange-switcher-status");
      const btnNse = document.getElementById("btn-exchange-nse");
      const btnBse = document.getElementById("btn-exchange-bse");

      if (badgeEl) {
        badgeEl.textContent = exch === "BSE"
          ? `BSE: ${(bseQuoteSnapshot && bseQuoteSnapshot.bseCode) || stock.bseCode || stock.symbol}`
          : `NSE: ${stock.symbol}`;
        badgeEl.style.background = exch === "BSE" ? "#2563eb" : "#10b981";
      }
      if (cmpEl) cmpEl.textContent = `₹ ${Number(q.cmp).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      if (pillEl) {
        const gain = q.isGain;
        const dc = Math.abs(Number(q.dayChange) || 0).toFixed(2);
        const dcp = Math.abs(Number(q.dayChangePct) || 0);
        pillEl.textContent = gain ? `+ ₹${dc} (+${dcp}%) Day Gain` : `- ₹${dc} (-${dcp}%) Day Loss`;
        pillEl.style.background = gain ? "#f0fdf4" : "#fef2f2";
        pillEl.style.color = gain ? "#16a34a" : "#dc2626";
        pillEl.style.borderColor = gain ? "#bbf7d0" : "#fecaca";
      }
      if (sessEl) sessEl.textContent = `(Session: ${q.lastUpdated || "Today, 3:30 PM IST"})`;
      if (openEl) openEl.textContent = `₹ ${Number(q.dayOpen).toLocaleString("en-IN")}`;
      if (highEl) highEl.textContent = `₹ ${Number(q.dayHigh).toLocaleString("en-IN")}`;
      if (lowEl) lowEl.textContent = `₹ ${Number(q.dayLow).toLocaleString("en-IN")}`;
      if (prevEl) prevEl.textContent = `₹ ${Number(q.prevClose).toLocaleString("en-IN")}`;
      if (h52El) h52El.textContent = `₹ ${Number(q.high52 || high52).toLocaleString("en-IN")}`;
      if (l52El) l52El.textContent = `₹ ${Number(q.low52 || low52).toLocaleString("en-IN")}`;
      if (curPriceEl) curPriceEl.textContent = `₹ ${Number(q.cmp).toLocaleString("en-IN")}`;
      if (statusEl) statusEl.textContent = exch === "BSE" ? "Exchange: BSE" : "Exchange: NSE";

      if (btnNse) {
        const active = exch === "NSE";
        btnNse.setAttribute("aria-pressed", active ? "true" : "false");
        btnNse.style.background = active ? "#0f172a" : "#ffffff";
        btnNse.style.color = active ? "#ffffff" : "#334155";
        btnNse.style.borderColor = active ? "#0f172a" : "#cbd5e1";
      }
      if (btnBse) {
        const active = exch === "BSE";
        btnBse.setAttribute("aria-pressed", active ? "true" : "false");
        btnBse.style.background = active ? "#2563eb" : "#ffffff";
        btnBse.style.color = active ? "#ffffff" : "#334155";
        btnBse.style.borderColor = active ? "#2563eb" : "#cbd5e1";
      }
    }

    const btnNseInit = document.getElementById("btn-exchange-nse");
    const btnBseInit = document.getElementById("btn-exchange-bse");
    if (btnNseInit) {
      btnNseInit.addEventListener("click", () => {
        if (stock.exchanges !== "BSE") applyExchangeQuote("NSE");
      });
    }
    if (btnBseInit) {
      btnBseInit.addEventListener("click", () => {
        if (bseQuoteSnapshot) applyExchangeQuote("BSE");
      });
    }

    loadBseQuote(stock.symbol).then((bse) => {
      if (!activeCompanyData || activeCompanyData.symbol !== stock.symbol) return;
      const btnBse = document.getElementById("btn-exchange-bse");
      if (bse && bse.cmp) {
        bseQuoteSnapshot = {
          ...bse,
          high52: Math.max(high52 || 0, bse.dayHigh || 0),
          low52: low52 > 0 ? Math.min(low52, bse.dayLow || low52) : (bse.dayLow || 0)
        };
        if (btnBse) {
          btnBse.disabled = false;
          btnBse.removeAttribute("title");
          btnBse.style.cursor = "pointer";
          btnBse.style.opacity = "1";
          btnBse.textContent = `BSE (${bse.bseCode})`;
        }
        const tvBseBtn = document.getElementById("tv-btn-open-bse");
        if (tvBseBtn) {
          const bseSym = bse.bseSymbol || bse.bseCode || stock.bseCode || stock.symbol;
          tvBseBtn.setAttribute("href", `https://www.tradingview.com/chart/?symbol=${encodeURIComponent("BSE:" + bseSym)}`);
          tvBseBtn.style.display = "inline-block";
        }
        if (stock.exchanges === "BSE") {
          applyExchangeQuote("BSE");
        }
      } else if (btnBse && stock.exchanges !== "BSE") {
        btnBse.disabled = true;
        btnBse.title = "Not listed on BSE";
        btnBse.style.cursor = "not-allowed";
        btnBse.style.opacity = "0.5";
        btnBse.textContent = "BSE (N/A)";
        const tvBseBtn = document.getElementById("tv-btn-open-bse");
        if (tvBseBtn) tvBseBtn.style.display = "none";
      }
    });

    // Load real NSE announcements for this company (free, refreshed daily by the sync script)
    if (!isBseOnly) loadCompanyNews(stock.symbol).then((items) => {
      if (!activeCompanyData || activeCompanyData.symbol !== stock.symbol) return;
      const listEl = document.getElementById("company-news-list");
      if (listEl && (items.length > 0 || !initialNews)) {
        listEl.innerHTML = renderNewsItems(items.map((n) => Object.assign({ source: "NSE Filing" }, n)), stock);
      }

      // Automatically detect if the company has published an official Annual Report PDF in NSE filings
      const arItem = (items || []).find((it) => {
        if (!it || !it.link || !/^https:\/\//i.test(it.link)) return false;
        const combined = `${it.category || ""} ${it.headline || ""}`;
        return /annual\s*report|integrated\s*report|business\s*responsibility.*sustainability\s*report/i.test(combined);
      });
      if (arItem && arItem.link) {
        stock.latestAnnualReportUrl = arItem.link;
        const headerArBtn = document.getElementById("btn-annual-report-header");
        if (headerArBtn) {
          headerArBtn.href = arItem.link;
          headerArBtn.textContent = `View Latest Annual Report PDF (${arItem.date || "Official"}) ↗`;
        }
        const aboutArBtn = document.getElementById("btn-annual-report-about");
        if (aboutArBtn) {
          aboutArBtn.href = arItem.link;
          aboutArBtn.textContent = `Official Latest Annual Report PDF (${stock.symbol} - ${arItem.date || "NSE"}) ↗`;
        }
      }
    });


    // Connect Dedicated "Go Back to Home & Stock Search" Button
    const backHomeBtn = document.getElementById("btn-back-to-home-search");
    if (backHomeBtn) {
      backHomeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        closeCompanyAnalysis();
      });
    }

    // Connect Audio Readout for About the Company
    const listenBtn = document.getElementById("btn-listen-company");
    if (listenBtn) {
      listenBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCompanyVoiceOverview(stock);
      });
    }

    if (shouldScroll) {
      stockResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ---------------- DEDICATED RELIABLE SPEECH SYNTHESIS ENGINE ----------------
  function resetListenButtonUI() {
    const listenBtn = document.getElementById("btn-listen-company");
    if (listenBtn) {
      listenBtn.textContent = "Listen to About the Company";
      listenBtn.setAttribute("aria-pressed", "false");
      listenBtn.style.background = "";
      listenBtn.style.color = "";
    }
    window._stocks360IsSpeakingCompany = false;
    window._stocks360SpeechUtterance = null;
  }

  function getAboutCompanyNarration(stock) {
    const aboutEl = document.getElementById("company-about-content");
    let text = "";
    if (aboutEl) {
      text = (aboutEl.innerText || aboutEl.textContent || "").trim();
    }
    if (!text && stock.about) {
      text = String(stock.about)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (!text) {
      text = `${stock.name} is a leading enterprise in the ${stock.sector || "Indian Equity"} sector in India, listed on the National Stock Exchange under symbol ${stock.symbol}.`;
    }
    return text;
  }

  function toggleCompanyVoiceOverview(stock) {
    const listenBtn = document.getElementById("btn-listen-company");

    // If currently speaking our company overview, stop it
    if (window._stocks360IsSpeakingCompany) {
      if ("speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
      resetListenButtonUI();
      return;
    }

    const narration = getAboutCompanyNarration(stock);

    // Record start timestamp so smart-assist.js does not cancel speech on reflexive Ctrl press
    window._stocks360SpeechStartedAt = Date.now();
    window._stocks360IsSpeakingCompany = true;

    if (listenBtn) {
      listenBtn.textContent = "Stop Listening";
      listenBtn.setAttribute("aria-pressed", "true");
      listenBtn.style.background = "#dc2626";
      listenBtn.style.color = "#ffffff";
    }

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(narration);
      utterance.rate = 0.95;
      utterance.volume = 1.0;
      utterance.pitch = 1.0;

      // Prefer a local English voice so Windows Chromium does not hang on remote Natural voices
      const voices = window.speechSynthesis.getVoices() || [];
      const localEn =
        voices.find((v) => v.localService && /en[-_](IN|GB|US)/i.test(v.lang)) ||
        voices.find((v) => v.localService && /^en/i.test(v.lang)) ||
        voices.find((v) => /^en/i.test(v.lang));

      if (localEn) {
        utterance.voice = localEn;
        utterance.lang = localEn.lang;
      } else {
        utterance.lang = "en-US";
      }

      window._stocks360SpeechUtterance = utterance;

      utterance.onend = function () {
        resetListenButtonUI();
      };

      utterance.onerror = function (err) {
        // Ignore 'interrupted' or 'canceled' events triggered by cancel()
        if (err && (err.error === "interrupted" || err.error === "canceled")) return;
        resetListenButtonUI();
      };

      // Speak synchronously inside the user gesture using the web default browser speech engine!
      window.speechSynthesis.speak(utterance);

      // Watchdog: if Chromium paused the queue, resume it after 150ms
      setTimeout(() => {
        if (window._stocks360IsSpeakingCompany && window.speechSynthesis.paused) {
          try { window.speechSynthesis.resume(); } catch (_) {}
        }
      }, 150);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
      resetListenButtonUI();
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Keyboard shortcut: Escape key closes stock analysis view and restores focus to search
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Escape" || e.key === "Esc") && stockResult && !stockResult.hidden && stockResult.style.display !== "none") {
      const openBox = stockResult.querySelector(".ratio-info-box:not([hidden])");
      if (openBox) {
        openBox.setAttribute("hidden", "");
        const toggleBtn = openBox.previousElementSibling;
        if (toggleBtn && toggleBtn.classList.contains("ratio-info-toggle-btn")) {
          toggleBtn.setAttribute("aria-expanded", "false");
          toggleBtn.focus();
        }
        return;
      }
      closeCompanyAnalysis();
    }
  });

  // Browser navigation history: popstate syncs stock search view
  window.addEventListener("popstate", function (e) {
    const p = new URLSearchParams(window.location.search);
    const sym = p.get("symbol") || p.get("stock");
    if (sym) {
      performSearch(sym, false);
    } else if (stockResult && !stockResult.hidden) {
      if (window._stocks360IsSpeakingCompany) {
        if ("speechSynthesis" in window) {
          try { window.speechSynthesis.cancel(); } catch (_) {}
        }
        resetListenButtonUI();
      }
      stockResult.hidden = true;
      stockResult.style.display = "none";
      stockResult.innerHTML = "";
      if (searchInput) searchInput.value = "";
    }
  });
});
