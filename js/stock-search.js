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

  // Common phonetic / alias substitutions for popular equities (longer keys first)
  const COMMON_ALIASES = {
    "AEGISLOGISTICS": "AEGISLOG",
    "LTIMINDTREE": "LTM",
    "TATAMOTORS": "TMPV",
    "TATAPOWER": "TATAPOWER",
    "HDFCBANK": "HDFCBANK",
    "ICICIBANK": "ICICIBANK",
    "INFOSIS": "INFY",
    "RELINCE": "RELIANCE",
    "ZOMATO": "ETERNAL",
    "EGIS": "AEGIS",
    "LTIM": "LTM"
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

  function prepareQueryContext(rawQuery) {
    let raw = String(rawQuery || "").trim().toUpperCase();
    if (!raw) return null;

    for (const [k, v] of Object.entries(COMMON_ALIASES)) {
      if (raw === k) {
        raw = v;
        break;
      }
      if (raw.includes(k)) {
        raw = raw.replace(new RegExp("\\b" + k + "\\b", "g"), v);
      }
    }

    const cleanQ = cleanAlphanumeric(raw);
    const qTokens = getQueryTokens(raw);
    const qStems = qTokens.map((tk) => (tk.length > 5 ? tk.slice(0, 5) : tk));
    return { raw, cleanQ, qTokens, qStems };
  }

  function getStockSearchCache(s) {
    if (s._sc) return s._sc;
    const symClean = cleanAlphanumeric(s.symbol);
    const nameUpper = String(s.name || "").toUpperCase();
    const cleanName = cleanAlphanumeric(nameUpper);
    const sectorUpper = String(s.sector || "").toUpperCase();
    const bseUpper = s.bseCode ? String(s.bseCode).toUpperCase() : "";
    const combinedTarget = (s.symbol + " " + nameUpper + " " + sectorUpper).toUpperCase();
    const nameWords = nameUpper.split(/\s+/);
    const targetWords = combinedTarget.split(/\s+/);
    s._sc = { symClean, nameUpper, cleanName, sectorUpper, bseUpper, combinedTarget, nameWords, targetWords };
    return s._sc;
  }

  function scoreStockWithContext(s, qCtx) {
    const { raw, cleanQ, qTokens, qStems } = qCtx;
    const sc = getStockSearchCache(s);

    // 1. Exact Symbol or BSE Scrip Code match -> top priority
    if (sc.symClean === cleanQ) return 1000;
    if (sc.bseUpper && sc.bseUpper === cleanQ) return 950;

    // 2. Symbol starts with clean query (e.g. HS -> HSCL, AEGIS -> AEGISLOG)
    if (sc.symClean.startsWith(cleanQ)) return 850;

    // 3. Exact clean Name match
    if (sc.cleanName === cleanQ) return 800;

    // 4. Name starts with raw query
    if (sc.nameUpper.startsWith(raw)) return 700;

    // 5. Symbol includes clean query (e.g. EGIS in AEGISLOG)
    if (sc.symClean.includes(cleanQ)) return 600;

    // 6. Name contains raw query
    if (sc.nameUpper.includes(raw)) return 500;

    // 7. Multi-token match
    if (qTokens.length > 0) {
      let matchedCount = 0;

      for (let i = 0; i < qTokens.length; i++) {
        const tk = qTokens[i];
        const stem = qStems[i];
        if (sc.combinedTarget.includes(tk) || sc.combinedTarget.includes(stem)) {
          matchedCount++;
          continue;
        }
        if (tk.length >= 4) {
          for (const tw of sc.targetWords) {
            if (tw.length >= 4) {
              const dist = levenshteinDistance(tk, tw);
              if (dist <= 1 || (dist <= 2 && tk.length >= 6)) {
                matchedCount++;
                break;
              }
            }
          }
        }
      }

      const ratio = matchedCount / qTokens.length;
      if (ratio === 1.0) return 450;
      if (ratio >= 0.7) return 300;
      if (ratio >= 0.4) return 150;
    }

    // 8. Fuzzy match for whole query against name words
    if (raw.length >= 4) {
      for (const w of sc.nameWords) {
        if (w.length >= 4 && levenshteinDistance(raw, w) <= 1) {
          return 350;
        }
      }
    }

    // 9. Sector contains query
    if (sc.sectorUpper.includes(raw)) return 100;

    return 0;
  }

  function findStock(query) {
    const qCtx = prepareQueryContext(query);
    if (!qCtx) return null;
    const dataset = getStockDataset();

    let bestStock = null;
    let highestScore = 0;

    for (const s of dataset) {
      const score = scoreStockWithContext(s, qCtx);
      if (score > highestScore) {
        highestScore = score;
        bestStock = s;
        if (highestScore === 1000) break;
      }
    }

    if (highestScore >= 100) {
      return bestStock;
    }
    return null;
  }

  function getMatchingSuggestions(query, limit = 6) {
    const qCtx = prepareQueryContext(query);
    if (!qCtx) return [];
    const dataset = getStockDataset();

    const scored = [];
    for (const s of dataset) {
      const score = scoreStockWithContext(s, qCtx);
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
    if (searchInput) {
      searchInput.value = "";
      if (typeof searchInput.blur === "function") searchInput.blur();
    }
    if (suggestionBox) {
      suggestionBox.style.display = "none";
      activeSuggestionIndex = -1;
      currentSuggestions = [];
    }
    performSearch(symbol, true);
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
    if (searchInput) {
      searchInput.value = "";
      if (typeof searchInput.blur === "function") searchInput.blur();
    }
    try {
      history.pushState({ symbol: stock.symbol }, "", `index.html?symbol=${encodeURIComponent(stock.symbol)}`);
    } catch (_) {}
    renderDetailedCompanyAnalysis(stock, shouldScroll);
  }

  function closeCompanyAnalysis() {
    stopCompanyVoiceOverview();
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
  function parseClientFilingNum(val) {
    if (val === null || val === undefined || val === "" || val === "--") return NaN;
    const cleaned = String(val).replace(/[^0-9.-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === ".") return NaN;
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : NaN;
  }

  function buildQuarterlyTableHtml(quarterlyResults, isLoading) {
    if (!Array.isArray(quarterlyResults) || quarterlyResults.length === 0) {
      return `<div style="padding:16px; color:#64748b; background:#f8fafc; border-radius:8px;">${isLoading ? "Loading official NSE quarterly results..." : "Quarterly results pending exchange filing."}</div>`;
    }
    const cols = quarterlyResults.slice(-10);
    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
        <table class="stocks360-data-table" id="company-quarterly-table" style="font-size:0.88rem; width:100%; border-collapse:collapse; min-width:720px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px; text-align:left; border-bottom:1px solid #e2e8f0; font-weight:700; min-width:170px;">Metric</th>
              ${cols.map(q => `<th style="padding:10px 12px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700; white-space:nowrap;">${escapeHtml(String(q.period))}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; white-space:nowrap;">Sales / Revenue</td>
              ${cols.map(q => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; white-space:nowrap;">₹ ${escapeHtml(String(q.sales))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Expenses</td>
              ${cols.map(q => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b; white-space:nowrap;">₹ ${escapeHtml(String(q.expenses))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; white-space:nowrap;">Operating Profit</td>
              ${cols.map(q => {
                const n = parseClientFilingNum(q.operatingProfit);
                const col = !isNaN(n) && n < 0 ? "#dc2626" : "#0f172a";
                return `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:600; color:${col}; white-space:nowrap;">₹ ${escapeHtml(String(q.operatingProfit))}</td>`;
              }).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">OPM %</td>
              ${cols.map(q => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; white-space:nowrap;">${escapeHtml(String(q.opm))}</td>`).join('')}
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:700; color:#0f172a; white-space:nowrap;">Net Profit (PAT)</td>
              ${cols.map(q => {
                const n = parseClientFilingNum(q.netProfit);
                const col = !isNaN(n) && n < 0 ? "#dc2626" : "#16a34a";
                return `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:700; color:${col}; white-space:nowrap;">₹ ${escapeHtml(String(q.netProfit))}</td>`;
              }).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; white-space:nowrap;">EPS in Rs</td>
              ${cols.map(q => `<td style="padding:10px 12px; text-align:right; white-space:nowrap;">${escapeHtml(String(q.eps))}</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function buildAnnualPnlTableHtml(annualPnl, isLoading) {
    if (!Array.isArray(annualPnl) || annualPnl.length === 0) {
      return `<div style="padding:16px; color:#64748b; background:#f8fafc; border-radius:8px;">${isLoading ? "Loading official NSE annual profit &amp; loss statements..." : "Annual profit &amp; loss statements pending official exchange filings."}</div>`;
    }
    const cols = annualPnl.slice(-4);
    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
        <table class="stocks360-data-table" id="company-annual-pnl-table" style="font-size:0.88rem; width:100%; border-collapse:collapse; min-width:540px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px; text-align:left; border-bottom:1px solid #e2e8f0; font-weight:700; min-width:170px;">Metric</th>
              ${cols.map(a => `<th style="padding:10px 12px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700; white-space:nowrap;">${escapeHtml(String(a.year))}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; white-space:nowrap;">Sales / Revenue</td>
              ${cols.map(a => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; white-space:nowrap;">₹ ${escapeHtml(String(a.sales))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Expenses</td>
              ${cols.map(a => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b; white-space:nowrap;">₹ ${escapeHtml(String(a.expenses))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; white-space:nowrap;">Operating Profit (PBT)</td>
              ${cols.map(a => {
                const n = parseClientFilingNum(a.operatingProfit);
                const col = !isNaN(n) && n < 0 ? "#dc2626" : "#0f172a";
                return `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:600; color:${col}; white-space:nowrap;">₹ ${escapeHtml(String(a.operatingProfit))}</td>`;
              }).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">OPM %</td>
              ${cols.map(a => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; white-space:nowrap;">${escapeHtml(String(a.opm))}</td>`).join('')}
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:700; color:#0f172a; white-space:nowrap;">Net Profit (PAT)</td>
              ${cols.map(a => {
                const n = parseClientFilingNum(a.netProfit);
                const col = !isNaN(n) && n < 0 ? "#dc2626" : "#16a34a";
                return `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:700; color:${col}; white-space:nowrap;">₹ ${escapeHtml(String(a.netProfit))}</td>`;
              }).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; white-space:nowrap;">EPS in Rs</td>
              ${cols.map(a => `<td style="padding:10px 12px; text-align:right; white-space:nowrap;">${escapeHtml(String(a.eps))}</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function buildBalanceSheetTableHtml(balanceSheet, isLoading) {
    if (!Array.isArray(balanceSheet) || balanceSheet.length === 0) {
      return `<div style="padding:16px; color:#64748b; background:#f8fafc; border-radius:8px;">${isLoading ? "Loading official NSE XBRL balance sheet..." : "Balance sheet statements pending exchange filing."}</div>`;
    }
    const cols = balanceSheet.slice(-6);
    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
        <table class="stocks360-data-table" id="company-balancesheet-table" style="font-size:0.88rem; width:100%; border-collapse:collapse; min-width:620px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px; text-align:left; border-bottom:1px solid #e2e8f0; font-weight:700; min-width:170px;">Line Item</th>
              ${cols.map(b => `<th style="padding:10px 12px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700; white-space:nowrap;">${escapeHtml(String(b.year))}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Equity Capital</td>
              ${cols.map(b => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; white-space:nowrap;">₹ ${escapeHtml(String(b.equityCapital))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Reserves &amp; Surplus</td>
              ${cols.map(b => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; white-space:nowrap;">₹ ${escapeHtml(String(b.reserves))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; white-space:nowrap;">Borrowings (Debt)</td>
              ${cols.map(b => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:600; color:${b.borrowings === 'Nil' || b.borrowings === '0' ? '#16a34a' : '#0f172a'}; white-space:nowrap;">${b.borrowings === 'Nil' ? 'Nil' : '₹ ' + escapeHtml(String(b.borrowings))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Other Liabilities</td>
              ${cols.map(b => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b; white-space:nowrap;">₹ ${escapeHtml(String(b.otherLiabilities))}</td>`).join('')}
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; font-weight:700; white-space:nowrap;">Total Liabilities</td>
              ${cols.map(b => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700; white-space:nowrap;">₹ ${escapeHtml(String(b.totalLiabilities))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Fixed Assets</td>
              ${cols.map(b => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; white-space:nowrap;">₹ ${escapeHtml(String(b.fixedAssets))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Investments</td>
              ${cols.map(b => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; white-space:nowrap;">₹ ${escapeHtml(String(b.investments))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Other Assets</td>
              ${cols.map(b => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b; white-space:nowrap;">₹ ${escapeHtml(String(b.otherAssets))}</td>`).join('')}
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; font-weight:700; white-space:nowrap;">Total Assets</td>
              ${cols.map(b => `<td style="padding:10px 12px; text-align:right; font-weight:700; white-space:nowrap;">₹ ${escapeHtml(String(b.totalAssets))}</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function buildCashFlowTableHtml(cashFlows, isLoading) {
    if (!Array.isArray(cashFlows) || cashFlows.length === 0) {
      return `<div style="padding:16px; color:#64748b; background:#f8fafc; border-radius:8px;">${isLoading ? "Loading official NSE XBRL cash flows..." : "Cash flow statements pending exchange filing."}</div>`;
    }
    const cols = cashFlows.slice(-6);
    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
        <table class="stocks360-data-table" id="company-cashflow-table" style="font-size:0.88rem; width:100%; border-collapse:collapse; min-width:620px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px; text-align:left; border-bottom:1px solid #e2e8f0; font-weight:700; min-width:210px;">Activity</th>
              ${cols.map(c => `<th style="padding:10px 12px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700; white-space:nowrap;">${escapeHtml(String(c.year))}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; color:#0f172a; white-space:nowrap;">Cash from Operating Activity (CFO)</td>
              ${cols.map(c => {
                const n = parseClientFilingNum(c.cfo);
                const col = !isNaN(n) && n < 0 ? "#dc2626" : "#16a34a";
                return `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:600; color:${col}; white-space:nowrap;">₹ ${escapeHtml(String(c.cfo))}</td>`;
              }).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Cash from Investing Activity (CFI)</td>
              ${cols.map(c => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b; white-space:nowrap;">₹ ${escapeHtml(String(c.cfi))}</td>`).join('')}
            </tr>
            <tr>
              <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">Cash from Financing Activity (CFF)</td>
              ${cols.map(c => `<td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f1f5f9; color:#64748b; white-space:nowrap;">₹ ${escapeHtml(String(c.cff))}</td>`).join('')}
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; font-weight:700; white-space:nowrap;">Net Cash Flow</td>
              ${cols.map(c => {
                const val = c.netCash ?? c.netCashFlow ?? '--';
                const n = parseClientFilingNum(val);
                const col = !isNaN(n) && n < 0 ? "#dc2626" : "#0f172a";
                return `<td style="padding:10px 12px; text-align:right; font-weight:700; color:${col}; white-space:nowrap;">₹ ${escapeHtml(String(val))}</td>`;
              }).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function buildShareholdingHtml(shareholding, isLoading) {
    if (!shareholding || typeof shareholding !== "object" || !shareholding.promoters) {
      return `<div style="padding:16px; color:#64748b; background:#f8fafc; border-radius:8px;">${isLoading ? "Loading official NSE shareholding pattern..." : "Shareholding pattern pending official exchange filing."}</div>`;
    }

    const fmtPctCell = (val) => {
      if (val === null || val === undefined || val === "" || isNaN(Number(val))) return '<span style="color:#94a3b8;">--</span>';
      return `${Number(val).toFixed(2)}%`;
    };

    if (Array.isArray(shareholding.quarters) && shareholding.quarters.length > 0 && shareholding.series) {
      const qs = shareholding.quarters;
      const nQ = qs.length;
      const s = shareholding.series;
      const holders = shareholding.holders || {};
      const promHolders = Array.isArray(holders.promoters) ? holders.promoters : [];
      const fiiHolders = Array.isArray(holders.fii) ? holders.fii : [];
      const diiHolders = Array.isArray(holders.dii) ? holders.dii : [];
      const pubHolders = Array.isArray(holders.public) ? holders.public : [];

      const hasAnyNumeric = (arr) => Array.isArray(arr) && arr.some((v) => typeof v === "number" && v > 0);
      const hasFiiOrDii = Array.isArray(s.fii) && s.fii.some((v) => v !== null && v !== undefined);
      const hasDiiSub = hasAnyNumeric(s.diiMutualFunds) || hasAnyNumeric(s.diiInsurance) || hasAnyNumeric(s.diiPensionFunds);
      const hasGovt = hasAnyNumeric(s.government);
      const hasEmpTrust = hasAnyNumeric(s.employeeTrusts);
      const hasAnyNamedHolders = promHolders.length > 0 || fiiHolders.length > 0 || diiHolders.length > 0 || pubHolders.length > 0 || hasDiiSub;

      const buildSeriesCells = (arr, isBold = false, color = "#0f172a") => {
        return qs.map((_, qi) => {
          const val = Array.isArray(arr) ? arr[qi] : null;
          return `<td style="padding:9px 12px; text-align:right; border-bottom:1px solid #f1f5f9; font-weight:${isBold ? "700" : "600"}; color:${color}; white-space:nowrap;">${fmtPctCell(val)}</td>`;
        }).join("");
      };

      const buildHolderRows = (groupKey, list, badgeBg, badgeColor) => {
        if (!Array.isArray(list) || list.length === 0) return "";
        return list.map((h) => {
          const hist = Array.isArray(h.history) && h.history.length === nQ
            ? h.history
            : qs.map((_, qi) => (qi === nQ - 1 ? h.pct : null));
          const subBadge = h.subCategory
            ? `<span style="font-size:0.68rem; font-weight:600; padding:1px 6px; border-radius:4px; background:${badgeBg}; color:${badgeColor}; margin-left:6px; white-space:nowrap;">${escapeHtml(h.subCategory)}</span>`
            : "";
          return `
            <tr class="shp-holder-subrow" data-shp-parent="${escapeHtml(groupKey)}" style="background:#fcfdff;">
              <td style="padding:7px 12px 7px 32px; border-bottom:1px solid #f1f5f9; font-size:0.82rem; color:#334155; font-weight:500;">
                <span style="color:#94a3b8; margin-right:6px;">&#8627;</span>${escapeHtml(h.name)}${subBadge}
              </td>
              ${hist.map((val) => `<td style="padding:7px 12px; text-align:right; border-bottom:1px solid #f1f5f9; font-size:0.82rem; color:#475569; white-space:nowrap;">${fmtPctCell(val)}</td>`).join("")}
            </tr>
          `;
        }).join("");
      };

      const buildDiiCategorySubRows = () => {
        if (!hasDiiSub) return "";
        const subRows = [
          { label: "Mutual Funds (Category Total)", arr: s.diiMutualFunds },
          { label: "Insurance Companies (Category Total)", arr: s.diiInsurance },
          { label: "Provident & Pension Funds (Category Total)", arr: s.diiPensionFunds }
        ].filter((r) => hasAnyNumeric(r.arr));
        return subRows.map((r) => `
          <tr class="shp-holder-subrow" data-shp-parent="dii" style="background:#f8fafc;">
            <td style="padding:7px 12px 7px 26px; border-bottom:1px solid #f1f5f9; font-size:0.82rem; color:#0f172a; font-weight:600;">
              <span style="color:#059669; margin-right:6px;">&bull;</span>${escapeHtml(r.label)}
            </td>
            ${qs.map((_, qi) => `<td style="padding:7px 12px; text-align:right; border-bottom:1px solid #f1f5f9; font-size:0.82rem; font-weight:600; color:#0f172a; white-space:nowrap;">${fmtPctCell(r.arr[qi])}</td>`).join("")}
          </tr>
        `).join("");
      };

      const renderCatToggleBtn = (groupKey, countLabel) => `
        <button type="button" class="shp-cat-toggle-btn" data-shp-group="${escapeHtml(groupKey)}" aria-expanded="true" title="Expand or collapse named ${escapeHtml(groupKey)} shareholders" style="margin-left:8px; padding:1px 7px; font-size:0.75rem; font-weight:700; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:4px; cursor:pointer;">
          <span class="shp-toggle-icon">&minus;</span> ${escapeHtml(countLabel)}
        </button>
      `;

      const latestIdx = nQ - 1;
      const latestProm = Number(s.promoters && s.promoters[latestIdx]) || 0;
      const latestFii = Number(s.fii && s.fii[latestIdx]) || 0;
      const latestDii = Number(s.dii && s.dii[latestIdx]) || 0;
      const latestGovt = Number(s.government && s.government[latestIdx]) || 0;
      const latestPub = Number(s.public && s.public[latestIdx]) || Math.max(0, Number((100 - latestProm - latestFii - latestDii - latestGovt).toFixed(2)));

      return `
        ${hasAnyNamedHolders ? `
          <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
            <button type="button" id="btn-toggle-all-shp-holders" data-expanded="true" style="padding:5px 12px; font-size:0.78rem; font-weight:700; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; cursor:pointer;">
              Collapse Named Institutions (&minus;)
            </button>
          </div>
        ` : ""}
        <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:14px;">
          <table class="stocks360-data-table" id="company-shareholding-table" style="font-size:0.86rem; width:100%; border-collapse:collapse; min-width:720px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:10px 14px; text-align:left; border-bottom:1px solid #e2e8f0; font-weight:700; min-width:260px;">Shareholder Category / Named Institution</th>
                ${qs.map((q) => `<th style="padding:10px 12px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:700; white-space:nowrap;">${escapeHtml(q)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:700; color:#0f172a;">
                  <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#2563eb; margin-right:8px;"></span>Promoters &amp; Promoter Group
                  ${promHolders.length > 0 ? renderCatToggleBtn("promoters", `${promHolders.length} named`) : ""}
                </td>
                ${buildSeriesCells(s.promoters, true, "#0f172a")}
              </tr>
              ${buildHolderRows("promoters", promHolders, "#dbeafe", "#1e40af")}

              ${hasFiiOrDii ? `
                <tr>
                  <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:700; color:#0f172a;">
                    <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#7c3aed; margin-right:8px;"></span>FIIs / Foreign Institutions (FPI)
                    ${fiiHolders.length > 0 ? renderCatToggleBtn("fii", `${fiiHolders.length} institutions`) : ""}
                  </td>
                  ${buildSeriesCells(s.fii, true, "#0f172a")}
                </tr>
                ${buildHolderRows("fii", fiiHolders, "#f3e8ff", "#6b21a8")}

                <tr>
                  <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:700; color:#0f172a;">
                    <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#059669; margin-right:8px;"></span>DIIs / Domestic Institutions (MF, Insurance, NPS)
                    ${(diiHolders.length > 0 || hasDiiSub) ? renderCatToggleBtn("dii", diiHolders.length > 0 ? `${diiHolders.length} institutions` : "breakdown") : ""}
                  </td>
                  ${buildSeriesCells(s.dii, true, "#0f172a")}
                </tr>
                ${buildDiiCategorySubRows()}
                ${buildHolderRows("dii", diiHolders, "#d1fae5", "#065f46")}
              ` : ""}

              ${hasGovt ? `
                <tr>
                  <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; color:#0f172a;">
                    <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#d97706; margin-right:8px;"></span>Government (Central / State)
                  </td>
                  ${buildSeriesCells(s.government, false, "#334155")}
                </tr>
              ` : ""}

              <tr>
                <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:700; color:#0f172a;">
                  <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#64748b; margin-right:8px;"></span>Public &amp; Retail Shareholders
                  ${pubHolders.length > 0 ? renderCatToggleBtn("public", `${pubHolders.length} major`) : ""}
                </td>
                ${buildSeriesCells(s.public, false, "#334155")}
              </tr>
              ${buildHolderRows("public", pubHolders, "#f1f5f9", "#334155")}

              ${hasEmpTrust ? `
                <tr>
                  <td style="padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; color:#475569;">
                    <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:#0ea5e9; margin-right:8px;"></span>Employee Benefit Trusts
                  </td>
                  ${buildSeriesCells(s.employeeTrusts, false, "#475569")}
                </tr>
              ` : ""}

              <tr style="background:#fafafa;">
                <td style="padding:10px 14px; font-weight:700; color:#0f172a;">Total Shareholding</td>
                ${qs.map(() => `<td style="padding:10px 12px; text-align:right; font-weight:700; color:#0f172a;">100.00%</td>`).join("")}
              </tr>
            </tbody>
          </table>
        </div>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px; font-size:0.8rem; color:#334155; font-weight:600;">
            <span>Latest Filing Split (${escapeHtml(qs[latestIdx])}):</span>
            <div style="display:flex; flex-wrap:wrap; gap:14px;">
              <span><i style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#2563eb; margin-right:5px;"></i>Promoters: ${latestProm.toFixed(2)}%</span>
              ${hasFiiOrDii ? `
                <span><i style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#7c3aed; margin-right:5px;"></i>FIIs: ${latestFii.toFixed(2)}%</span>
                <span><i style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#059669; margin-right:5px;"></i>DIIs: ${latestDii.toFixed(2)}%</span>
              ` : ""}
              ${latestGovt > 0 ? `<span><i style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#d97706; margin-right:5px;"></i>Govt: ${latestGovt.toFixed(2)}%</span>` : ""}
              <span><i style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#64748b; margin-right:5px;"></i>Public: ${latestPub.toFixed(2)}%</span>
            </div>
          </div>
          <div style="height:12px; border-radius:6px; overflow:hidden; display:flex; background:#94a3b8;">
            <div style="width:${Math.max(0, Math.min(100, latestProm))}%; background:#2563eb;" title="Promoters: ${latestProm.toFixed(2)}%"></div>
            <div style="width:${Math.max(0, Math.min(100, latestFii))}%; background:#7c3aed;" title="FIIs: ${latestFii.toFixed(2)}%"></div>
            <div style="width:${Math.max(0, Math.min(100, latestDii))}%; background:#059669;" title="DIIs: ${latestDii.toFixed(2)}%"></div>
            <div style="width:${Math.max(0, Math.min(100, latestGovt))}%; background:#d97706;" title="Government: ${latestGovt.toFixed(2)}%"></div>
          </div>
        </div>
      `;
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

  function buildFundamentalsGridHtml(stock, quoteOverride) {
    const activeCmp = Number((quoteOverride && quoteOverride.cmp) || stock.cmp) || 0;
    const activeVol = Number(quoteOverride && quoteOverride.volume !== undefined ? quoteOverride.volume : stock.volume) || 0;
    const activeHigh52 = Number((quoteOverride && quoteOverride.high52) || stock.high52) || 0;
    const activeLow52 = Number((quoteOverride && quoteOverride.low52) || stock.low52) || 0;
    const activeDayHigh = Number((quoteOverride && quoteOverride.dayHigh) || stock.dayHigh || activeCmp) || 0;
    const activeDayLow = Number((quoteOverride && quoteOverride.dayLow) || stock.dayLow || activeCmp) || 0;
    const activePrevClose = Number((quoteOverride && quoteOverride.prevClose) || stock.prevClose || activeCmp) || 0;
    const activeExch = (quoteOverride && quoteOverride.exchangeLabel) || (stock.exchanges === "BSE" ? "BSE" : "NSE");
    const isBseOnly = stock.exchanges === "BSE";

    const tradedValCr = activeCmp > 0 && activeVol > 0 ? (activeCmp * activeVol) / 10000000 : 0;
    const tradedValText = tradedValCr >= 0.1
      ? `₹ ${tradedValCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`
      : (activeCmp > 0 && activeVol > 0 ? `₹ ${((activeCmp * activeVol) / 100000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L` : "Not Traded");

    let activeMcapCr = null;
    if (typeof stock.sharesCr === "number" && stock.sharesCr > 0 && activeCmp > 0) {
      activeMcapCr = Math.round(activeCmp * stock.sharesCr);
    } else if (typeof stock.marketCapCr === "number" && stock.marketCapCr > 0) {
      activeMcapCr = stock.cmp > 0 ? Math.round(stock.marketCapCr * (activeCmp / stock.cmp)) : stock.marketCapCr;
    }

    let activePe = null;
    if (typeof stock.ttmEps === "number" && stock.ttmEps > 0 && activeCmp > 0) {
      const rawPe = activeCmp / stock.ttmEps;
      if (rawPe > 0 && rawPe < 2000) activePe = Number(rawPe.toFixed(1));
    } else if (typeof stock.pe === "number" && stock.pe > 0) {
      const ratio = stock.cmp > 0 ? (activeCmp / stock.cmp) : 1;
      activePe = Number((stock.pe * ratio).toFixed(1));
    }

    const fmtNum = (val, digits = 2) => Number(val).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

    const bhavcopyCards = [
      {
        id: "metric-current-price",
        label: "Current Price",
        btnLabel: "Current Price Information",
        value: activeCmp > 0 ? `₹ ${fmtNum(activeCmp)}` : "Not Available",
        info: `Latest closing equity price on ${activeExch}.`
      },
      {
        id: "metric-high-low-52",
        label: "52W High / Low",
        btnLabel: "52W High / Low Information",
        value: activeHigh52 > 0 && activeLow52 > 0 ? `₹ ${fmtNum(activeHigh52)} / ₹ ${fmtNum(activeLow52)}` : "Not Available",
        info: "Highest and lowest traded prices tracked over the past 52 weeks."
      },
      {
        id: "metric-traded-value",
        label: "Daily Traded Value",
        btnLabel: "Daily Traded Value Information",
        value: tradedValText,
        info: `Session turnover computed from official ${activeExch} closing price and traded volume.`
      },
      {
        id: "metric-volume",
        label: "Trading Volume",
        btnLabel: "Trading Volume Information",
        value: activeVol > 0 ? `${activeVol.toLocaleString("en-IN")} shares` : "0 shares",
        info: "Total number of equity shares traded in the latest exchange session."
      }
    ];

    const filingCards = isBseOnly
      ? [
          {
            id: "metric-prev-close",
            label: "Previous Close",
            btnLabel: "Previous Close Information",
            value: activePrevClose > 0 ? `₹ ${fmtNum(activePrevClose)}` : "Not Available",
            info: `Official previous session closing price on ${activeExch}.`
          },
          {
            id: "metric-day-range",
            label: "Day High / Low",
            btnLabel: "Day High / Low Information",
            value: activeDayHigh > 0 && activeDayLow > 0 ? `₹ ${fmtNum(activeDayHigh)} / ₹ ${fmtNum(activeDayLow)}` : "Not Available",
            info: `Intraday highest and lowest traded prices on ${activeExch}.`
          },
          {
            id: "metric-avg-vol",
            label: "10-Day Avg Volume",
            btnLabel: "10-Day Avg Volume Information",
            value: Number(stock.avgVolume) > 0 ? `${Math.round(Number(stock.avgVolume)).toLocaleString("en-IN")} shares` : `${activeVol.toLocaleString("en-IN")} shares`,
            info: "Rolling 10-session average daily trading volume."
          },
          {
            id: "metric-dma-pair",
            label: "50-DMA / 200-DMA",
            btnLabel: "50-DMA / 200-DMA Information",
            value: Number(stock.dma50) > 0 && Number(stock.dma200) > 0 ? `₹ ${fmtNum(stock.dma50)} / ₹ ${fmtNum(stock.dma200)}` : `₹ ${fmtNum(activeCmp)}`,
            info: "50-Day and 200-Day Moving Averages computed from official exchange closing prices."
          }
        ]
      : [
          {
            id: "metric-mcap",
            label: "Market Cap",
            btnLabel: "Market Cap Information",
            value: activeMcapCr ? `₹ ${activeMcapCr.toLocaleString("en-IN")} Cr` : "Pending Filing",
            info: "Current Market Price multiplied by diluted equity shares derived from latest official NSE quarterly filings."
          },
          {
            id: "metric-pe",
            label: "Stock P/E (TTM)",
            btnLabel: "Stock P/E Information",
            value: activePe !== null ? `${activePe}x` : (typeof stock.ttmEps === "number" && stock.ttmEps <= 0 ? "N/A (Loss)" : "Pending Filing"),
            info: "Current Market Price divided by Trailing 12-Month Diluted EPS from official NSE filings."
          },
          {
            id: "metric-ttm-eps",
            label: "TTM EPS",
            btnLabel: "TTM EPS Information",
            value: typeof stock.ttmEps === "number" ? `₹ ${fmtNum(stock.ttmEps)}` : "Pending Filing",
            info: "Trailing 12-Month Diluted Earnings Per Share from official NSE quarterly filings."
          },
          {
            id: "metric-book-value",
            label: "Book Value",
            btnLabel: "Book Value Information",
            value: typeof stock.bookValue === "number" ? `₹ ${fmtNum(stock.bookValue, 1)}` : "Pending Filing",
            info: "Net Worth (Equity Capital + Reserves) from official NSE XBRL Balance Sheet divided by diluted shares."
          },
          {
            id: "metric-roe",
            label: "ROE % (TTM)",
            btnLabel: "ROE Information",
            value: typeof stock.roePct === "number" ? `${stock.roePct}%` : "Pending Filing",
            info: "Trailing 12-Month Net Profit divided by Total Equity (Equity Capital + Reserves) from official NSE filings."
          },
          {
            id: "metric-roce",
            label: "ROCE % (TTM)",
            btnLabel: "ROCE Information",
            value: typeof stock.rocePct === "number" ? `${stock.rocePct}%` : "Pending Filing",
            info: "Trailing 12-Month Operating Profit (PBT) divided by Capital Employed (Total Equity + Borrowings) from official NSE filings."
          },
          {
            id: "metric-de",
            label: "Debt to Equity",
            btnLabel: "Debt to Equity Information",
            value: typeof stock.debtToEquity === "number" ? `${stock.debtToEquity}` : "Pending Filing",
            info: "Total Borrowings divided by Total Equity from latest official NSE XBRL Balance Sheet filing."
          },
          {
            id: "metric-ttm-rev-pat",
            label: "TTM Sales / Net Profit",
            btnLabel: "TTM Sales & Profit Information",
            value: typeof stock.ttmSalesCr === "number"
              ? `₹ ${stock.ttmSalesCr.toLocaleString("en-IN")} / ₹ ${(stock.ttmPatCr ?? 0).toLocaleString("en-IN")} Cr`
              : "Pending Filing",
            info: "Cumulative Trailing 12-Month Sales and Net Profit (₹ Crores) from official NSE quarterly filings."
          }
        ];

    const cards = bhavcopyCards.concat(filingCards);

    return `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
        ${cards.map((c) => `
          <div class="fundamental-item-card" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px;">
            <div class="fundamental-line-item" style="display:block; font-size:0.94rem; color:#0f172a; line-height:1.5; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
              <span style="color:#475569; font-weight:600;">${escapeHtml(c.label)}:</span>
              <strong id="${escapeHtml(c.id)}" style="font-size:0.98rem; color:#0f172a; font-weight:700; margin-left:6px;">${escapeHtml(c.value)}</strong>
            </div>
            <div style="margin-top:8px; display:block;">
              <button type="button" class="ratio-info-toggle-btn" aria-expanded="false" style="cursor:pointer; font-size:0.76rem; font-weight:600; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:4px 10px; display:inline-block;">
                ${escapeHtml(c.btnLabel || (c.label + " Information"))}
              </button>
              <div class="ratio-info-box" hidden style="margin-top:6px; font-size:0.8rem; color:#334155; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; line-height:1.45;">
                ${escapeHtml(c.info)}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function computeStocks360QvtScore(stock) {
    const isBankOrNbfc = /^(BANKS|CREDIT SERVICES|MORTGAGE FINANCE|FINANCIAL CONGLOMERATES|INSURANCE)/i.test(String(stock.industry || ""))
      || /BANKING & FINANCIAL|FINANCIAL SERVICES & NBFC/i.test(String(stock.sector || ""));

    // 1. QUALITY (strictly normalized over available audited metrics — zero neutral fallbacks)
    let qEarned = 0;
    let qAvail = 0;

    const roe = typeof stock.roePct === "number" ? stock.roePct : null;
    const roce = typeof stock.rocePct === "number" ? stock.rocePct : null;
    if (isBankOrNbfc && roe !== null) {
      qEarned += roe >= 16 ? 25 : roe >= 12 ? 20 : roe >= 8 ? 14 : roe > 0 ? 8 : 0;
      qAvail += 25;
    } else if (!isBankOrNbfc && (roe !== null || roce !== null)) {
      if (roe !== null) {
        qEarned += roe >= 20 ? 15 : roe >= 15 ? 12 : roe >= 10 ? 8 : roe > 0 ? 4 : 0;
        qAvail += 15;
      }
      if (roce !== null) {
        qEarned += roce >= 20 ? 10 : roce >= 15 ? 8 : roce >= 10 ? 5 : roce > 0 ? 2 : 0;
        qAvail += 10;
      }
    }

    let salesGrowthPct = null;
    let patGrowthPct = null;
    const ap = Array.isArray(stock.annualPnl) ? stock.annualPnl.filter((r) => r && r.year !== "TTM") : [];
    if (ap.length >= 2) {
      const first = ap[0], last = ap[ap.length - 1];
      const s0 = parseClientFilingNum(first.sales), s1 = parseClientFilingNum(last.sales);
      const p0 = parseClientFilingNum(first.netProfit), p1 = parseClientFilingNum(last.netProfit);
      const yrs = Math.max(1, ap.length - 1);
      if (s0 > 0 && s1 > 0) salesGrowthPct = (Math.pow(s1 / s0, 1 / yrs) - 1) * 100;
      if (p0 > 0 && p1 > 0) patGrowthPct = (Math.pow(p1 / p0, 1 / yrs) - 1) * 100;
      else if (p0 < 0 && p1 > 0) patGrowthPct = 20;
    } else if (Array.isArray(stock.quarterlyResults) && stock.quarterlyResults.length >= 5) {
      const qr = stock.quarterlyResults;
      const cur = qr[qr.length - 1], prev = qr[qr.length - 5];
      const s0 = parseClientFilingNum(prev.sales), s1 = parseClientFilingNum(cur.sales);
      const p0 = parseClientFilingNum(prev.netProfit), p1 = parseClientFilingNum(cur.netProfit);
      if (s0 > 0 && s1 > 0) salesGrowthPct = ((s1 - s0) / s0) * 100;
      if (p0 > 0 && p1 > 0) patGrowthPct = ((p1 - p0) / p0) * 100;
    }
    if (salesGrowthPct !== null) {
      qEarned += salesGrowthPct >= 15 ? 12 : salesGrowthPct >= 8 ? 9 : salesGrowthPct > 0 ? 6 : 2;
      qAvail += 12;
    }
    if (patGrowthPct !== null) {
      qEarned += patGrowthPct >= 15 ? 13 : patGrowthPct >= 8 ? 10 : patGrowthPct > 0 ? 6 : 1;
      qAvail += 13;
    }

    const cfs = Array.isArray(stock.cashFlows) ? stock.cashFlows : [];
    if (cfs.length > 0) {
      const posCfo = cfs.filter((c) => { const v = parseClientFilingNum(c.cfo); return !isNaN(v) && v > 0; }).length;
      qEarned += Math.round((posCfo / cfs.length) * 20);
      qAvail += 20;
    }

    if (isBankOrNbfc && typeof stock.bookValue === "number" && stock.bookValue > 0) {
      qEarned += 15;
      qAvail += 15;
    } else if (!isBankOrNbfc && typeof stock.debtToEquity === "number") {
      const de = stock.debtToEquity;
      qEarned += de <= 0.25 ? 15 : de <= 0.50 ? 12 : de <= 1.0 ? 8 : de <= 1.5 ? 4 : 1;
      qAvail += 15;
    }

    const sh = stock.shareholding;
    if (sh && typeof sh === "object" && sh.promoters !== undefined) {
      const prom = parseFloat(sh.promoters) || 0;
      const fii = parseFloat(sh.fii) || 0;
      const dii = parseFloat(sh.dii) || 0;
      const basePts = (prom >= 30 || (fii + dii) >= 40) ? 8 : (prom >= 15 || (fii + dii) >= 20) ? 5 : 3;
      let stabPts = 7;
      if (sh.series && Array.isArray(sh.series.promoters) && sh.series.promoters.length >= 2) {
        const firstP = Number(sh.series.promoters[0]) || 0;
        const lastP = Number(sh.series.promoters[sh.series.promoters.length - 1]) || 0;
        if (firstP - lastP > 3) stabPts = 3;
      }
      qEarned += basePts + stabPts;
      qAvail += 15;
    }

    const q = qAvail >= 40 ? Math.max(0, Math.min(100, Math.round((qEarned / qAvail) * 100))) : null;

    // 2. VALUE (strictly normalized over available valuation metrics; null if loss/missing P/E)
    let vEarned = 0;
    let vAvail = 0;
    const dataset = getStockDataset();
    const targetInd = String(stock.industry || "").trim().toLowerCase();
    const peerPes = dataset
      .filter((p) => targetInd && String(p.industry || "").trim().toLowerCase() === targetInd && typeof p.pe === "number" && p.pe > 0 && p.pe < 250)
      .map((p) => p.pe);
    const peerAvgPe = peerPes.length > 0 ? peerPes.reduce((a, b) => a + b, 0) / peerPes.length : null;
    const pe = typeof stock.pe === "number" && stock.pe > 0 ? stock.pe : null;

    if (pe !== null) {
      if (peerAvgPe !== null && peerAvgPe > 0) {
        const ratio = pe / peerAvgPe;
        vEarned += ratio <= 0.70 ? 40 : ratio <= 0.90 ? 34 : ratio <= 1.10 ? 26 : ratio <= 1.35 ? 18 : ratio <= 1.75 ? 10 : 4;
        vAvail += 40;
      }
      vEarned += pe <= 12 ? 30 : pe <= 18 ? 25 : pe <= 25 ? 19 : pe <= 35 ? 13 : pe <= 50 ? 7 : 3;
      vAvail += 30;
    }
    const pb = (Number(stock.cmp) > 0 && typeof stock.bookValue === "number" && stock.bookValue > 0)
      ? (Number(stock.cmp) / stock.bookValue)
      : null;
    if (pb !== null) {
      vEarned += pb <= 1.5 ? 30 : pb <= 2.5 ? 25 : pb <= 4.0 ? 19 : pb <= 6.5 ? 13 : pb <= 10.0 ? 7 : 3;
      vAvail += 30;
    }
    const v = (pe !== null && vAvail >= 30) ? Math.max(0, Math.min(100, Math.round((vEarned / vAvail) * 100))) : null;

    // 3. TECHNICAL MOMENTUM (strictly normalized over available Bhavcopy technicals)
    let tEarned = 0;
    let tAvail = 0;
    const cmp = Number(stock.cmp) || 0;
    const dma50 = Number(stock.dma50) || 0;
    const dma200 = Number(stock.dma200) || 0;
    const h52 = Number(stock.high52) || 0;
    const l52 = Number(stock.low52) || 0;
    const rsi = typeof stock.rsi14 === "number" && stock.rsi14 > 0 ? stock.rsi14 : null;
    const volSurge = Number(stock.volumeSurge) || 0;
    const delivPct = Number(stock.deliveryPct) || 0;

    if (cmp > 0 && dma200 > 0 && dma50 > 0) {
      tEarned += (cmp > dma200 ? 15 : 0) + (cmp > dma50 ? 10 : 0) + ((stock.goldenCross || dma50 > dma200) ? 10 : 0);
      tAvail += 35;
    }
    if (cmp > 0 && h52 > l52 && l52 > 0) {
      const pos = Math.max(0, Math.min(1, (cmp - l52) / (h52 - l52)));
      tEarned += Math.round(pos * 25);
      tAvail += 25;
    }
    if (rsi !== null) {
      tEarned += (rsi >= 50 && rsi <= 70) ? 20 : ((rsi >= 40 && rsi < 50) || (rsi > 70 && rsi <= 80)) ? 14 : rsi > 80 ? 10 : rsi >= 30 ? 8 : 5;
      tAvail += 20;
    }
    if (volSurge > 0) {
      tEarned += volSurge >= 1.25 ? 10 : volSurge >= 1.0 ? 6 : 3;
      tAvail += 10;
    }
    if (delivPct > 0) {
      tEarned += delivPct >= 50 ? 10 : delivPct >= 35 ? 7 : 4;
      tAvail += 10;
    }
    const t = tAvail >= 40 ? Math.max(0, Math.min(100, Math.round((tEarned / tAvail) * 100))) : null;

    const pillars = [q, v, t].filter((x) => typeof x === "number");
    const overall = pillars.length >= 2 ? Math.round(pillars.reduce((a, b) => a + b, 0) / pillars.length) : null;

    return { q, v, t, overall, isBankOrNbfc };
  }

  function buildQvtScoreSectionHtml(stock) {
    if (!stock || stock.exchanges === "BSE") return "";
    const qvt = computeStocks360QvtScore(stock);
    const getBand = (score, labels) => {
      if (score === null || score === undefined) return { text: "N/A", color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1" };
      return score >= 70 ? { text: labels[0], color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" }
        : score >= 45 ? { text: labels[1], color: "#b45309", bg: "#fffbeb", border: "#fde68a" }
        : { text: labels[2], color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" };
    };

    const qBand = getBand(qvt.q, ["Strong", "Moderate", "Weak"]);
    const vBand = getBand(qvt.v, ["Attractive", "Fair", "Expensive"]);
    const tBand = getBand(qvt.t, ["Bullish", "Neutral", "Bearish"]);

    const cards = [
      {
        id: "qvt-quality",
        label: "Quality",
        btnLabel: "Quality Information",
        score: qvt.q,
        band: qBand,
        desc: "Evaluates 3-year financial durability from official NSE filings: return efficiency (ROE/ROCE), multi-year revenue & profit growth consistency, operating cash flow generation, balance sheet leverage safety, and promoter/institutional ownership stability."
      },
      {
        id: "qvt-value",
        label: "Value",
        btnLabel: "Value Information",
        score: qvt.v,
        band: vBand,
        desc: "Evaluates valuation attractiveness by comparing the stock's current TTM P/E against its exact industry peer average, earnings yield (100/P/E), and Price-to-Book multiple."
      },
      {
        id: "qvt-momentum",
        label: "Technical Momentum",
        btnLabel: "Technical Momentum Information",
        score: qvt.t,
        band: tBand,
        desc: "Evaluates price and volume trend strength from daily NSE market data: 50-DMA & 200-DMA alignment, Golden Crossover, 52-week range position, 14-day RSI zone, volume surge, and delivery conviction."
      }
    ];

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <h3 style="font-size:1.25rem; color:#0f172a; margin:0; font-weight:700;">Stocks 360 QVT Score</h3>
          <span id="qvt-overall-pill" style="font-size:0.84rem; font-weight:700; padding:4px 10px; border-radius:999px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">
            Overall QVT: ${typeof qvt.overall === "number" ? `${qvt.overall} / 100` : "N/A"}
          </span>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-bottom:12px;">
        ${cards.map((c) => `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
              <span style="font-size:0.96rem; color:#334155; font-weight:700;">${escapeHtml(c.label)}:</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <strong id="${escapeHtml(c.id)}" style="font-size:1.05rem; color:#0f172a; font-weight:800;">${typeof c.score === "number" ? `${c.score} / 100` : "N/A"}</strong>
                <span style="font-size:0.74rem; font-weight:700; padding:2px 8px; border-radius:999px; background:${c.band.bg}; color:${c.band.color}; border:1px solid ${c.band.border};">${escapeHtml(c.band.text)}</span>
              </div>
            </div>
            <div style="margin-top:8px; display:block;">
              <button type="button" class="ratio-info-toggle-btn" aria-expanded="false" style="cursor:pointer; font-size:0.76rem; font-weight:600; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:4px 10px; display:inline-block;">
                ${escapeHtml(c.btnLabel)}
              </button>
              <div class="ratio-info-box" hidden style="margin-top:6px; font-size:0.8rem; color:#334155; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:10px 12px; line-height:1.48;">
                ${escapeHtml(c.desc)}
              </div>
            </div>
          </div>
        `).join("")}
      </div>

      <div id="qvt-methodology-disclaimer" style="font-size:0.78rem; color:#64748b; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:9px 12px; line-height:1.45;">
        <strong style="color:#92400e;">Disclaimer:</strong> The Stocks 360 QVT Score is a rule-based analytical metric derived solely from the last 3 years of official NSE financial filings and daily market technicals. Because multi-decade historical data is not used for backtesting, this score is not backtested across prior market cycles and is meant strictly for educational and screening reference, not SEBI-registered investment advice. Stocks 360 is not a SEBI registered investment adviser.
      </div>
    `;
  }

  function buildStockPeerComparisonHtml(stock) {
    const dataset = getStockDataset();
    const targetInd = String(stock.industry || "").trim().toLowerCase();
    const targetSec = String(stock.sector || "").trim().toLowerCase();
    const isBseOnly = stock.exchanges === "BSE";

    function peerRankScore(p) {
      const mcap = Number(p.marketCapCr) || 0;
      const hasFullRatios = mcap > 0 && typeof p.pe === "number" && typeof p.roePct === "number" && typeof p.debtToEquity === "number";
      if (hasFullRatios) return mcap * 1000000;
      if (mcap > 0) return mcap * 100000;
      return ((Number(p.cmp) || 0) * (Number(p.volume) || 0)) / 10000000;
    }

    // Tier 1: Exact industry peers (never displaced by broad sector backfill)
    const industryPeers = [];
    const seenSyms = new Set();

    if (targetInd) {
      for (const s of dataset) {
        if (s && s.symbol && String(s.industry || "").trim().toLowerCase() === targetInd) {
          seenSyms.add(s.symbol);
          industryPeers.push(s);
        }
      }
    }
    industryPeers.sort((a, b) => peerRankScore(b) - peerRankScore(a));

    // Take up to 7 top peers from Tier 1 (exact industry) + ensure current stock is included
    const topPeers = [];
    const included = new Set();
    for (const p of industryPeers) {
      if (topPeers.length >= 7 && p.symbol !== stock.symbol) continue;
      if (!included.has(p.symbol)) {
        included.add(p.symbol);
        topPeers.push(p.symbol === stock.symbol ? stock : p);
      }
      if (topPeers.length >= 8) break;
    }

    if (!included.has(stock.symbol)) {
      included.add(stock.symbol);
      topPeers.push(stock);
    }

    // Tier 2: Backfill from normalized sector ONLY when exact industry has fewer than 8 total companies
    if (topPeers.length < 8 && targetSec) {
      const sectorBackfill = [];
      for (const s of dataset) {
        if (s && s.symbol && !seenSyms.has(s.symbol) && !included.has(s.symbol) && String(s.sector || "").trim().toLowerCase() === targetSec) {
          sectorBackfill.push(s);
        }
      }
      sectorBackfill.sort((a, b) => peerRankScore(b) - peerRankScore(a));
      for (const p of sectorBackfill) {
        if (topPeers.length >= 8) break;
        included.add(p.symbol);
        topPeers.push(p);
      }
    }

    topPeers.sort((a, b) => peerRankScore(b) - peerRankScore(a));

    function avgMetric(list, getter, digits, positiveOnly) {
      const vals = list.map(getter).filter((v) => typeof v === "number" && !isNaN(v) && (!positiveOnly || v > 0));
      if (vals.length === 0) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return digits === 0 ? Math.round(avg) : Number(avg.toFixed(digits));
    }
    const avgCmp = avgMetric(topPeers, (p) => (p.cmp !== undefined && p.cmp !== null ? Number(p.cmp) : NaN), 2, true);
    const avgChg = avgMetric(topPeers, (p) => (p.dayChangePct !== undefined && p.dayChangePct !== null ? Number(p.dayChangePct) : NaN), 2, false);
    const avgMcap = avgMetric(topPeers, (p) => (typeof p.marketCapCr === "number" && p.marketCapCr > 0 ? p.marketCapCr : NaN), 0, true);
    const avgPe = avgMetric(topPeers, (p) => (typeof p.pe === "number" && p.pe > 0 ? p.pe : NaN), 1, true);
    const avgRoe = avgMetric(topPeers, (p) => (typeof p.roePct === "number" ? p.roePct : NaN), 1, false);
    const avgDe = avgMetric(topPeers, (p) => (typeof p.debtToEquity === "number" ? p.debtToEquity : NaN), 2, false);
    const avgH52 = avgMetric(topPeers, (p) => (Number(p.high52) > 0 ? Number(p.high52) : NaN), 2, true);
    const avgL52 = avgMetric(topPeers, (p) => (Number(p.low52) > 0 ? Number(p.low52) : NaN), 2, true);
    const avgDma50 = avgMetric(topPeers, (p) => (p.dma50 !== undefined && p.dma50 !== null ? Number(p.dma50) : NaN), 2, true);
    const avgDma200 = avgMetric(topPeers, (p) => (p.dma200 !== undefined && p.dma200 !== null ? Number(p.dma200) : NaN), 2, true);
    const avgRsi = avgMetric(topPeers, (p) => (p.rsi14 !== undefined && p.rsi14 !== null ? Number(p.rsi14) : NaN), 1, true);
    const avgSurge = avgMetric(topPeers, (p) => (Number(p.volumeSurge) > 0 ? Number(p.volumeSurge) : NaN), 2, true);
    const avgTurnover = avgMetric(topPeers, (p) => (Number(p.cmp) > 0 && Number(p.volume) > 0 ? (Number(p.cmp) * Number(p.volume)) / 10000000 : NaN), 2, true);

    if (isBseOnly) {
      return `
        <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
          <table id="company-peers-table" style="width:100%; border-collapse:collapse; font-size:0.85rem; min-width:960px;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left;">
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; width:42px;">S.No.</th>
                <th style="padding:10px 12px; color:#1e293b; font-weight:700;">Company Name</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700;">Exchange</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">CMP (₹)</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">Day Chg %</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">52W High (₹)</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">52W Low (₹)</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">50-DMA (₹)</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">200-DMA (₹)</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">14D RSI</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">Vol Surge</th>
                <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">Traded Val (₹ Cr)</th>
              </tr>
            </thead>
            <tbody>
              ${topPeers
                .map((p, idx) => {
                  const isCurrent = p.symbol === stock.symbol;
                  const pCmp = Number(p.cmp) || 0;
                  const pChg = typeof p.dayChangePct === "number" && !isNaN(p.dayChangePct) ? p.dayChangePct : null;
                  const pH52 = Number(p.high52) > 0 ? "₹ " + Number(p.high52).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
                  const pL52 = Number(p.low52) > 0 ? "₹ " + Number(p.low52).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
                  const pDma50 = Number(p.dma50) > 0 ? "₹ " + Number(p.dma50).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
                  const pDma200 = Number(p.dma200) > 0 ? "₹ " + Number(p.dma200).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
                  const pRsi = typeof p.rsi14 === "number" && p.rsi14 > 0 ? Number(p.rsi14).toFixed(1) : "--";
                  const pSurge = Number(p.volumeSurge) > 0 ? Number(p.volumeSurge).toFixed(2) + "x" : "--";
                  const pTurnoverCr = pCmp > 0 && Number(p.volume) > 0 ? ((pCmp * Number(p.volume)) / 10000000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
                  const pExch = p.exchanges || (p.bseCode ? "NSE,BSE" : "NSE");
                  const chgColor = pChg === null ? "#64748b" : (pChg >= 0 ? "#16a34a" : "#dc2626");
                  const chgText = pChg === null ? "--" : `${pChg >= 0 ? "+" : ""}${pChg.toFixed(2)}%`;
                  return `
                    <tr style="background:${isCurrent ? "#eff6ff" : idx % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #f1f5f9;">
                      <td style="padding:10px 10px; color:#64748b; font-weight:600;">${idx + 1}.</td>
                      <td style="padding:10px 12px;">
                        <a href="index.html?symbol=${encodeURIComponent(p.symbol)}" class="stock-peer-link" data-symbol="${escapeHtml(p.symbol)}" style="color:${isCurrent ? "#1d4ed8" : "#2563eb"}; font-weight:${isCurrent ? "800" : "700"}; text-decoration:none;">
                          ${escapeHtml(p.name)}
                        </a>
                        <span style="font-size:0.75rem; color:#64748b; margin-left:6px;">(${escapeHtml(p.symbol)})</span>
                      </td>
                      <td style="padding:10px 10px; color:#475569; font-size:0.78rem; font-weight:600;">${escapeHtml(pExch)}</td>
                      <td style="padding:10px 10px; text-align:right; font-weight:700; color:#0f172a;">₹ ${pCmp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style="padding:10px 10px; text-align:right; font-weight:700; color:${chgColor};">${chgText}</td>
                      <td style="padding:10px 10px; text-align:right; color:#334155;">${pH52}</td>
                      <td style="padding:10px 10px; text-align:right; color:#334155;">${pL52}</td>
                      <td style="padding:10px 10px; text-align:right; color:#334155;">${pDma50}</td>
                      <td style="padding:10px 10px; text-align:right; color:#334155;">${pDma200}</td>
                      <td style="padding:10px 10px; text-align:right; font-weight:600; color:#0f172a;">${pRsi}</td>
                      <td style="padding:10px 10px; text-align:right; color:#334155;">${pSurge}</td>
                      <td style="padding:10px 10px; text-align:right; color:#475569;">${pTurnoverCr}</td>
                    </tr>
                  `;
                })
                .join("")}
              <tr style="background:#f8fafc; border-top:2px solid #cbd5e1; font-weight:700;">
                <td style="padding:10px 10px; color:#64748b;">—</td>
                <td style="padding:10px 12px; color:#0f172a;">Peer Average (${escapeHtml(stock.industry || stock.sector || "Peers")})</td>
                <td style="padding:10px 10px; color:#64748b;">—</td>
                <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgCmp !== null ? "₹ " + avgCmp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</td>
                <td style="padding:10px 10px; text-align:right; color:${avgChg !== null && avgChg >= 0 ? "#16a34a" : "#dc2626"};">${avgChg !== null ? (avgChg >= 0 ? "+" : "") + avgChg.toFixed(2) + "%" : "--"}</td>
                <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgH52 !== null ? "₹ " + avgH52.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</td>
                <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgL52 !== null ? "₹ " + avgL52.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</td>
                <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgDma50 !== null ? "₹ " + avgDma50.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</td>
                <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgDma200 !== null ? "₹ " + avgDma200.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</td>
                <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgRsi !== null ? avgRsi.toFixed(1) : "--"}</td>
                <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgSurge !== null ? avgSurge.toFixed(2) + "x" : "--"}</td>
                <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgTurnover !== null ? avgTurnover.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    return `
      <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px;">
        <table id="company-peers-table" style="width:100%; border-collapse:collapse; font-size:0.85rem; min-width:960px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left;">
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; width:42px;">S.No.</th>
              <th style="padding:10px 12px; color:#1e293b; font-weight:700;">Company Name</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700;">Exchange</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">CMP (₹)</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">Day Chg %</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">Mar Cap (₹ Cr)</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">P/E</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">ROE %</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">Debt/Eq</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">50-DMA (₹)</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">14D RSI</th>
              <th style="padding:10px 10px; color:#1e293b; font-weight:700; text-align:right;">Traded Val (₹ Cr)</th>
            </tr>
          </thead>
          <tbody>
            ${topPeers
              .map((p, idx) => {
                const isCurrent = p.symbol === stock.symbol;
                const pCmp = Number(p.cmp) || 0;
                const pChg = typeof p.dayChangePct === "number" && !isNaN(p.dayChangePct) ? p.dayChangePct : null;
                const pMcap = typeof p.marketCapCr === "number" && p.marketCapCr > 0 ? Number(p.marketCapCr).toLocaleString("en-IN") : "--";
                const pPe = typeof p.pe === "number" && p.pe > 0 ? Number(p.pe).toFixed(1) : "--";
                const pRoe = typeof p.roePct === "number" ? Number(p.roePct).toFixed(1) + "%" : "--";
                const pDe = typeof p.debtToEquity === "number" ? Number(p.debtToEquity).toFixed(2) : "--";
                const pDma50 = Number(p.dma50) > 0 ? "₹ " + Number(p.dma50).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
                const pRsi = typeof p.rsi14 === "number" && p.rsi14 > 0 ? Number(p.rsi14).toFixed(1) : "--";
                const pTurnoverCr = pCmp > 0 && Number(p.volume) > 0 ? ((pCmp * Number(p.volume)) / 10000000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
                const pExch = p.exchanges || (p.bseCode ? "NSE,BSE" : "NSE");
                const chgColor = pChg === null ? "#64748b" : (pChg >= 0 ? "#16a34a" : "#dc2626");
                const chgText = pChg === null ? "--" : `${pChg >= 0 ? "+" : ""}${pChg.toFixed(2)}%`;
                return `
                  <tr style="background:${isCurrent ? "#eff6ff" : idx % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 10px; color:#64748b; font-weight:600;">${idx + 1}.</td>
                    <td style="padding:10px 12px;">
                      <a href="index.html?symbol=${encodeURIComponent(p.symbol)}" class="stock-peer-link" data-symbol="${escapeHtml(p.symbol)}" style="color:${isCurrent ? "#1d4ed8" : "#2563eb"}; font-weight:${isCurrent ? "800" : "700"}; text-decoration:none;">
                        ${escapeHtml(p.name)}
                      </a>
                      <span style="font-size:0.75rem; color:#64748b; margin-left:6px;">(${escapeHtml(p.symbol)})</span>
                    </td>
                    <td style="padding:10px 10px; color:#475569; font-size:0.78rem; font-weight:600;">${escapeHtml(pExch)}</td>
                    <td style="padding:10px 10px; text-align:right; font-weight:700; color:#0f172a;">₹ ${pCmp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding:10px 10px; text-align:right; font-weight:700; color:${chgColor};">${chgText}</td>
                    <td style="padding:10px 10px; text-align:right; font-weight:600; color:#0f172a;">${pMcap}</td>
                    <td style="padding:10px 10px; text-align:right; color:#334155;">${pPe}</td>
                    <td style="padding:10px 10px; text-align:right; color:#334155;">${pRoe}</td>
                    <td style="padding:10px 10px; text-align:right; color:#334155;">${pDe}</td>
                    <td style="padding:10px 10px; text-align:right; color:#334155;">${pDma50}</td>
                    <td style="padding:10px 10px; text-align:right; font-weight:600; color:#0f172a;">${pRsi}</td>
                    <td style="padding:10px 10px; text-align:right; color:#475569;">${pTurnoverCr}</td>
                  </tr>
                `;
              })
              .join("")}
            <tr style="background:#f8fafc; border-top:2px solid #cbd5e1; font-weight:700;">
              <td style="padding:10px 10px; color:#64748b;">—</td>
              <td style="padding:10px 12px; color:#0f172a;">Peer Average (${escapeHtml(stock.industry || stock.sector || "Peers")})</td>
              <td style="padding:10px 10px; color:#64748b;">—</td>
              <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgCmp !== null ? "₹ " + avgCmp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</td>
              <td style="padding:10px 10px; text-align:right; color:${avgChg !== null && avgChg >= 0 ? "#16a34a" : "#dc2626"};">${avgChg !== null ? (avgChg >= 0 ? "+" : "") + avgChg.toFixed(2) + "%" : "--"}</td>
              <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgMcap !== null ? avgMcap.toLocaleString("en-IN") : "--"}</td>
              <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgPe !== null ? avgPe.toFixed(1) : "--"}</td>
              <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgRoe !== null ? avgRoe.toFixed(1) + "%" : "--"}</td>
              <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgDe !== null ? avgDe.toFixed(2) : "--"}</td>
              <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgDma50 !== null ? "₹ " + avgDma50.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</td>
              <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgRsi !== null ? avgRsi.toFixed(1) : "--"}</td>
              <td style="padding:10px 10px; text-align:right; color:#0f172a;">${avgTurnover !== null ? avgTurnover.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</td>
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
      profileShardCache[key] = fetch("data/profiles/" + encodeURIComponent(key) + ".json?v=94")
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({}));
    }
    return profileShardCache[key].then((shard) => (shard && shard[String(symbol).toUpperCase()]) || null);
  }

  const bseShardCache = {};

  function loadBseQuote(symbol) {
    const key = newsShardKey(symbol);
    if (!bseShardCache[key]) {
      bseShardCache[key] = fetch("data/bse/" + encodeURIComponent(key) + ".json?v=94")
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
      newsShardCache[key] = fetch("data/news/" + encodeURIComponent(key) + ".json?v=94")
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
    const isProfileLoading = !isBseOnly && !stock._profileLoaded;

    // 2. Comprehensive Financial Statements Suites (Official Exchange Filings Only - No Synthetic Numbers)
    const quarterlyResults = (!isBseOnly && Array.isArray(stock.quarterlyResults)) ? stock.quarterlyResults : [];
    const balanceSheet = (!isBseOnly && Array.isArray(stock.balanceSheet)) ? stock.balanceSheet : [];
    const cashFlows = (!isBseOnly && Array.isArray(stock.cashFlows)) ? stock.cashFlows : [];
    const shareholding = (!isBseOnly && stock.shareholding && typeof stock.shareholding === "object") ? stock.shareholding : null;

    // 3. About the Company Profile Text
    const aboutText = stock.about
      ? (typeof stock.about === "string" && stock.about.includes("<p>") ? stock.about : formatProfileAbout(stock.about))
      : `<strong>${escapeHtml(stock.name)}</strong> is an equity security listed on ${isBseOnly ? "BSE Ltd" : "NSE"} in the <strong>${escapeHtml(stock.sector)}</strong> sector${stock.industry ? ` (${escapeHtml(stock.industry)})` : ""}.`;

    const initialNews = (!isBseOnly && Array.isArray(stock.news) && stock.news.length > 0) ? stock.news : null;

    // 5. Authentic Exchange OHLC & 52-Week Range metrics (zero synthetic multipliers)
    const fmtPrice = (v) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      ? `+ ₹${Math.abs(dayChange).toFixed(2)} (+${Math.abs(dayChangePct).toFixed(2)}%) Day Gain`
      : `- ₹${Math.abs(dayChange).toFixed(2)} (-${Math.abs(dayChangePct).toFixed(2)}%) Day Loss`;
    const sectorHeadingLabel = stock.industry && stock.industry !== stock.sector
      ? `${stock.sector} • ${stock.industry}`
      : (stock.sector || "Sector Peers");
    const delivVolText = typeof stock.deliveryVolume === "number" && stock.deliveryVolume > 0
      ? stock.deliveryVolume.toLocaleString("en-IN")
      : "--";
    const delivPctText = typeof stock.deliveryPct === "number" && stock.deliveryPct > 0
      ? Number(stock.deliveryPct).toFixed(2) + "%"
      : "--";

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
                <span id="company-sector-label" style="font-size:0.85rem; color:#64748b; font-weight:600;">${escapeHtml(sectorHeadingLabel)}</span>
                <a id="company-official-website-link" href="${stock.website ? escapeHtml(stock.website) : '#'}" target="_blank" rel="noopener noreferrer" style="display:${stock.website ? 'inline-flex' : 'none'}; font-size:0.8rem; color:#2563eb; font-weight:600; text-decoration:none; padding:2px 8px; border-radius:4px; background:#eff6ff; border:1px solid #bfdbfe;">
                  Official Website ↗
                </a>
              </div>
              <h2 id="company-view-title" style="margin:8px 0 4px 0; font-size:1.75rem; color:#0f172a; font-weight:800;">${escapeHtml(stock.name)}</h2>
              
              <div style="display:flex; align-items:baseline; gap:12px; margin-top:6px; flex-wrap:wrap;">
                <span id="company-hero-cmp" style="font-size:2.1rem; font-weight:800; color:#0f172a;">₹ ${fmtPrice(stock.cmp)}</span>
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
              <strong id="pp-open" style="font-size:0.92rem; color:#0f172a;">₹ ${fmtPrice(dayOpen)}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Today High</span>
              <strong id="pp-high" style="font-size:0.92rem; color:#16a34a;">₹ ${fmtPrice(dayHigh)}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Today Low</span>
              <strong id="pp-low" style="font-size:0.92rem; color:#dc2626;">₹ ${fmtPrice(dayLow)}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Previous Close</span>
              <strong id="pp-prev-close" style="font-size:0.92rem; color:#0f172a;">₹ ${fmtPrice(prevClose)}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">52-Week High</span>
              <strong id="pp-high52" style="font-size:0.92rem; color:#16a34a;">₹ ${fmtPrice(high52)}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">52-Week Low</span>
              <strong id="pp-low52" style="font-size:0.92rem; color:#dc2626;">₹ ${fmtPrice(low52)}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Delivery Volume</span>
              <strong id="pp-deliv-vol" style="font-size:0.92rem; color:#0f172a;">${delivVolText}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Delivery %</span>
              <strong id="pp-deliv-pct" style="font-size:0.92rem; color:#2563eb;">${delivPctText}</strong>
            </div>
          </div>
          <p id="price-delayed-disclaimer" role="note" hidden style="margin:10px 0 0 0; font-size:0.78rem; color:#92400e; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:7px 11px;">
            <strong>Market Hours Notice:</strong> Prices shown during market hours are delayed by 15 minutes and are provided strictly for informational and educational reference only.
          </p>
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

        <!-- SECTION 2: FUNDAMENTALS (BHAVCOPY + OFFICIAL EXCHANGE FILINGS) -->
        <section id="sec-fundamentals" style="margin-bottom:28px;">
          <h3 style="font-size:1.25rem; color:#0f172a; margin-bottom:14px; font-weight:700;">Fundamentals</h3>
          <div id="company-fundamentals-container">
            ${buildFundamentalsGridHtml(stock)}
          </div>
        </section>

        <!-- SECTION 3: TECHNICALS -->
        <section id="sec-technicals" style="margin-bottom:28px;">
          <h3 style="font-size:1.25rem; color:#0f172a; margin-bottom:14px; font-weight:700;">Technicals</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">50-DMA</span>
              <strong style="font-size:0.92rem; color:#0f172a;">${typeof stock.dma50 === "number" && stock.dma50 > 0 ? "₹ " + fmtPrice(stock.dma50) : "--"}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">200-DMA</span>
              <strong style="font-size:0.92rem; color:#0f172a;">${typeof stock.dma200 === "number" && stock.dma200 > 0 ? "₹ " + fmtPrice(stock.dma200) : "--"}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Golden Crossover</span>
              <strong style="font-size:0.92rem; color:${stock.goldenCross ? '#16a34a' : '#64748b'};">${stock.goldenCross ? 'Active Bullish' : 'Neutral'}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">14-Day RSI</span>
              <strong style="font-size:0.92rem; color:#0f172a;">${typeof stock.rsi14 === "number" && stock.rsi14 > 0 ? Number(stock.rsi14).toFixed(1) : "--"}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Volume Surge</span>
              <strong style="font-size:0.92rem; color:#0f172a;">${typeof stock.volumeSurge === "number" && stock.volumeSurge > 0 ? Number(stock.volumeSurge).toFixed(2) + "x" : "--"}</strong>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:#475569;">Trading Volume</span>
              <strong style="font-size:0.92rem; color:#0f172a;">${typeof stock.volume === "number" && stock.volume > 0 ? stock.volume.toLocaleString("en-IN") : "--"}</strong>
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

        <!-- SECTION 5B: STOCKS 360 QVT SCORE (NSE ONLY, BEFORE FINANCIALS) -->
        <section id="sec-qvt-score" ${isBseOnly ? 'hidden' : ''} style="margin-bottom:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
          <div id="company-qvt-container">
            ${isBseOnly ? '' : buildQvtScoreSectionHtml(stock)}
          </div>
        </section>

        <!-- SECTION 6: FINANCIALS (OFFICIAL EXCHANGE FILINGS ONLY) -->
        <section id="sec-financials" ${isBseOnly ? 'hidden' : ''} style="margin-bottom:24px;">
          <h3 style="font-size:1.25rem; color:#0f172a; margin-bottom:16px; font-weight:700; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">Financials</h3>

          <!-- 6.1: QUARTERLY RESULTS -->
          <div id="sec-quarterly" style="margin-bottom:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Quarterly Results (₹ Crores)</h4>
            <div id="company-quarterly-container">
              ${buildQuarterlyTableHtml(quarterlyResults, isProfileLoading)}
            </div>
          </div>

          <!-- 6.1B: ANNUAL PROFIT & LOSS -->
          <div id="sec-annual-pnl" style="margin-bottom:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Annual Profit &amp; Loss (₹ Crores)</h4>
            <div id="company-annual-pnl-container">
              ${buildAnnualPnlTableHtml((!isBseOnly && Array.isArray(stock.annualPnl)) ? stock.annualPnl : [], isProfileLoading)}
            </div>
          </div>

          <!-- 6.2: BALANCE SHEET -->
          <div id="sec-balancesheet" style="margin-bottom:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Balance Sheet (₹ Crores)</h4>
            <div id="company-balancesheet-container">
              ${buildBalanceSheetTableHtml(balanceSheet, isProfileLoading)}
            </div>
          </div>

          <!-- 6.3: CASH FLOWS -->
          <div id="sec-cashflow" style="margin-bottom:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Cash Flows (₹ Crores)</h4>
            <div id="company-cashflow-container">
              ${buildCashFlowTableHtml(cashFlows, isProfileLoading)}
            </div>
          </div>

          <!-- 6.4: SHAREHOLDING PATTERN -->
          <div id="sec-shareholding" style="margin-bottom:12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h4 style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Shareholding Pattern</h4>
            <div id="company-shareholding-container">
              ${buildShareholdingHtml(shareholding, isProfileLoading)}
            </div>
          </div>
        </section>

        <!-- SECTION 7: PEER COMPARISON -->
        <section id="sec-peers" style="margin-bottom:12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
          <h4 id="company-peers-title" style="font-size:1.15rem; color:#0f172a; margin:0 0 14px 0; font-weight:700;">Peer Comparison (${escapeHtml(stock.industry || stock.sector || "Sector Peers")})</h4>
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

        const shpCatBtn = e.target.closest(".shp-cat-toggle-btn");
        if (shpCatBtn) {
          e.preventDefault();
          const group = shpCatBtn.getAttribute("data-shp-group");
          const isExp = shpCatBtn.getAttribute("aria-expanded") !== "false";
          const nextExp = !isExp;
          shpCatBtn.setAttribute("aria-expanded", nextExp ? "true" : "false");
          const iconEl = shpCatBtn.querySelector(".shp-toggle-icon");
          if (iconEl) iconEl.innerHTML = nextExp ? "&minus;" : "+";
          const rows = stockResult.querySelectorAll(`tr.shp-holder-subrow[data-shp-parent="${group}"]`);
          rows.forEach((r) => {
            r.style.display = nextExp ? "" : "none";
          });
          return;
        }

        const shpAllBtn = e.target.closest("#btn-toggle-all-shp-holders");
        if (shpAllBtn) {
          e.preventDefault();
          const isExp = shpAllBtn.getAttribute("data-expanded") !== "false";
          const nextExp = !isExp;
          shpAllBtn.setAttribute("data-expanded", nextExp ? "true" : "false");
          shpAllBtn.innerHTML = nextExp ? "Collapse Named Institutions (&minus;)" : "Expand Named Institutions (+)";
          stockResult.querySelectorAll(".shp-cat-toggle-btn").forEach((b) => {
            b.setAttribute("aria-expanded", nextExp ? "true" : "false");
            const ic = b.querySelector(".shp-toggle-icon");
            if (ic) ic.innerHTML = nextExp ? "&minus;" : "+";
          });
          stockResult.querySelectorAll("tr.shp-holder-subrow").forEach((r) => {
            r.style.display = nextExp ? "" : "none";
          });
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

    // NSE / BSE Exchange Switcher state (declared before applyVerifiedProfileToView)
    const nseQuoteSnapshot = {
      exchangeLabel: "NSE",
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
      volume: stock.volume,
      deliveryVolume: stock.deliveryVolume,
      deliveryPct: stock.deliveryPct,
      lastUpdated: stock.lastUpdated || "Today, 3:30 PM IST"
    };
    let bseQuoteSnapshot = null;
    let activeExchangeView = stock.exchanges === "BSE" ? "BSE" : "NSE";

    // Helper to apply Verified profile data to DOM elements live
    function applyVerifiedProfileToView(profile) {
      if (!activeCompanyData || activeCompanyData.symbol !== stock.symbol) return;

      const sectorEl = document.getElementById("company-sector-label");
      if (sectorEl && (stock.sector || stock.industry)) {
        const lbl = stock.industry && stock.industry !== stock.sector
          ? `${stock.sector} • ${stock.industry}`
          : (stock.sector || "Sector Peers");
        sectorEl.textContent = lbl;
      }

      const aboutEl = document.getElementById("company-about-content");
      if (aboutEl && profile && profile.about) {
        aboutEl.innerHTML = formatProfileAbout(profile.about);
      }

      if (profile && profile.website) {
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

      const fundContainer = document.getElementById("company-fundamentals-container");
      if (fundContainer) {
        const activeQuote = activeExchangeView === "BSE" && bseQuoteSnapshot ? bseQuoteSnapshot : nseQuoteSnapshot;
        fundContainer.innerHTML = buildFundamentalsGridHtml(stock, activeQuote);
      }

      const qvtContainer = document.getElementById("company-qvt-container");
      if (qvtContainer && stock.exchanges !== "BSE") {
        qvtContainer.innerHTML = buildQvtScoreSectionHtml(stock);
      }

      const qContainer = document.getElementById("company-quarterly-container");
      if (qContainer) qContainer.innerHTML = buildQuarterlyTableHtml(stock.quarterlyResults, false);

      const apContainer = document.getElementById("company-annual-pnl-container");
      if (apContainer) apContainer.innerHTML = buildAnnualPnlTableHtml(stock.annualPnl, false);

      const bContainer = document.getElementById("company-balancesheet-container");
      if (bContainer) bContainer.innerHTML = buildBalanceSheetTableHtml(stock.balanceSheet, false);

      const cContainer = document.getElementById("company-cashflow-container");
      if (cContainer) cContainer.innerHTML = buildCashFlowTableHtml(stock.cashFlows, false);

      const shContainer = document.getElementById("company-shareholding-container");
      if (shContainer) shContainer.innerHTML = buildShareholdingHtml(stock.shareholding, false);

      const peersTitle = document.getElementById("company-peers-title");
      if (peersTitle) {
        peersTitle.textContent = `Peer Comparison (${stock.industry || stock.sector || "Sector Peers"})`;
      }
      const peersContainer = document.getElementById("company-peers-container");
      if (peersContainer) peersContainer.innerHTML = buildStockPeerComparisonHtml(stock);
    }

    // Load official verified profile shard (audited statements, balance sheet, cash flows, ratios, shareholding)
    if (!isBseOnly) loadVerifiedProfile(stock.symbol).then((verified) => {
      stock._profileLoaded = true;
      if (verified) {
        const protectedFields = new Set([
          "cmp", "dayOpen", "dayHigh", "dayLow", "prevClose", "dayChange", "dayChangePct",
          "isGain", "high52", "low52", "volume", "avgVolume", "volumeSurge",
          "dma50", "dma200", "rsi14", "goldenCross", "lastUpdated", "sector", "name", "symbol"
        ]);
        Object.keys(verified).forEach((k) => {
          if (!protectedFields.has(k) && verified[k] !== null && verified[k] !== undefined) {
            stock[k] = verified[k];
          }
        });
        if (verified.ratios && typeof verified.ratios === "object") {
          ["marketCapCr", "pe", "ttmEps", "ttmSalesCr", "ttmPatCr", "bookValue", "roePct", "rocePct", "debtToEquity", "promoterPct"].forEach((rk) => {
            if (stock[rk] === null || stock[rk] === undefined) {
              if (typeof verified.ratios[rk] === "number" && isFinite(verified.ratios[rk])) {
                stock[rk] = verified.ratios[rk];
              }
            }
          });
        }
      }
      if (activeCompanyData && activeCompanyData.symbol === stock.symbol) {
        applyVerifiedProfileToView(verified || {});
      }
    });

    function applyExchangeQuote(exch) {
      activeExchangeView = exch;
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
      const delivVolEl = document.getElementById("pp-deliv-vol");
      const delivPctEl = document.getElementById("pp-deliv-pct");
      const fundContainer = document.getElementById("company-fundamentals-container");
      const statusEl = document.getElementById("exchange-switcher-status");
      const btnNse = document.getElementById("btn-exchange-nse");
      const btnBse = document.getElementById("btn-exchange-bse");

      if (badgeEl) {
        badgeEl.textContent = exch === "BSE"
          ? `BSE: ${(bseQuoteSnapshot && bseQuoteSnapshot.bseCode) || stock.bseCode || stock.symbol}`
          : `NSE: ${stock.symbol}`;
        badgeEl.style.background = exch === "BSE" ? "#2563eb" : "#10b981";
      }
      if (cmpEl) cmpEl.textContent = `₹ ${fmtPrice(q.cmp)}`;
      if (pillEl) {
        const gain = q.isGain;
        const dc = Math.abs(Number(q.dayChange) || 0).toFixed(2);
        const dcp = Math.abs(Number(q.dayChangePct) || 0).toFixed(2);
        pillEl.textContent = gain ? `+ ₹${dc} (+${dcp}%) Day Gain` : `- ₹${dc} (-${dcp}%) Day Loss`;
        pillEl.style.background = gain ? "#f0fdf4" : "#fef2f2";
        pillEl.style.color = gain ? "#16a34a" : "#dc2626";
        pillEl.style.borderColor = gain ? "#bbf7d0" : "#fecaca";
      }
      if (sessEl) sessEl.textContent = `(Session: ${q.lastUpdated || "Today, 3:30 PM IST"})`;
      if (openEl) openEl.textContent = `₹ ${fmtPrice(q.dayOpen)}`;
      if (highEl) highEl.textContent = `₹ ${fmtPrice(q.dayHigh)}`;
      if (lowEl) lowEl.textContent = `₹ ${fmtPrice(q.dayLow)}`;
      if (prevEl) prevEl.textContent = `₹ ${fmtPrice(q.prevClose)}`;
      if (h52El) h52El.textContent = `₹ ${fmtPrice(q.high52 || high52)}`;
      if (l52El) l52El.textContent = `₹ ${fmtPrice(q.low52 || low52)}`;
      if (delivVolEl) delivVolEl.textContent = typeof q.deliveryVolume === "number" && q.deliveryVolume > 0 ? q.deliveryVolume.toLocaleString("en-IN") : "--";
      if (delivPctEl) delivPctEl.textContent = typeof q.deliveryPct === "number" && q.deliveryPct > 0 ? Number(q.deliveryPct).toFixed(2) + "%" : "--";
      if (fundContainer) {
        fundContainer.innerHTML = buildFundamentalsGridHtml(stock, Object.assign({ exchangeLabel: exch, high52, low52 }, q));
      }
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
    warmUpLocalVoice();
    refreshDelayedPriceIfMarketHours(stock, stock.exchanges === "BSE" ? "BSE" : "NSE");

    if (shouldScroll) {
      const headingEl = document.getElementById("company-view-title") || stockResult;
      const scrollFn = () => {
        if (headingEl && typeof headingEl.scrollIntoView === "function") {
          headingEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(scrollFn);
      } else {
        scrollFn();
      }
    }
  }

  // ---------------- DEDICATED LOW-LATENCY SPEECH SYNTHESIS ENGINE ----------------
  let cachedLocalEnVoice = null;
  function warmUpLocalVoice() {
    if (!("speechSynthesis" in window)) return null;
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      if (voices.length > 0) {
        cachedLocalEnVoice =
          voices.find((v) => v.localService && /en[-_](IN|GB|US)/i.test(v.lang)) ||
          voices.find((v) => v.localService && /^en/i.test(v.lang)) ||
          voices.find((v) => /^en/i.test(v.lang)) ||
          voices[0];
      }
    } catch (_) {}
    return cachedLocalEnVoice;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    warmUpLocalVoice();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", warmUpLocalVoice);
    }
  }

  function splitNarrationSentences(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return [];
    const parts = raw.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [raw];
    const chunks = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].trim();
      if (!p) continue;
      // Keep the very first chunk short (<= 120 chars) for sub-50ms start across all mobile & desktop devices
      if (chunks.length === 0 && p.length > 120) {
        const subParts = p.match(/[^,;]+[,;]?(?:\s+|$)/g) || [p];
        let firstBuf = "";
        for (let j = 0; j < subParts.length; j++) {
          const sp = subParts[j].trim();
          if (!sp) continue;
          if (!firstBuf || (chunks.length > 0 && firstBuf.length + sp.length <= 155)) {
            firstBuf = firstBuf ? firstBuf + " " + sp : sp;
          } else {
            chunks.push(firstBuf);
            firstBuf = sp;
          }
        }
        if (firstBuf) chunks.push(firstBuf);
      } else if (chunks.length > 1 && chunks[chunks.length - 1].length + p.length < 155) {
        chunks[chunks.length - 1] += " " + p;
      } else {
        chunks.push(p);
      }
    }
    return chunks;
  }

  function clearSpeechKeepAlive() {
    if (window._stocks360SpeechKeepAliveId) {
      clearInterval(window._stocks360SpeechKeepAliveId);
      window._stocks360SpeechKeepAliveId = null;
    }
  }

  function resetListenButtonUI() {
    clearSpeechKeepAlive();
    const listenBtn = document.getElementById("btn-listen-company");
    if (listenBtn) {
      listenBtn.textContent = "Listen to About the Company";
      listenBtn.setAttribute("aria-pressed", "false");
      listenBtn.setAttribute("aria-busy", "false");
      listenBtn.style.background = "";
      listenBtn.style.color = "";
    }
    window._stocks360IsSpeakingCompany = false;
    window._stocks360SpeechUtterance = null;
    window._stocks360SpeechSessionId = (window._stocks360SpeechSessionId || 0) + 1;
  }

  function stopCompanyVoiceOverview() {
    if (window._stocks360CompanyAudioEl) {
      try {
        window._stocks360CompanyAudioEl.pause();
        window._stocks360CompanyAudioEl.removeAttribute("src");
        window._stocks360CompanyAudioEl.load();
      } catch (_) {}
      window._stocks360CompanyAudioEl = null;
    }
    if ("speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    resetListenButtonUI();
  }

  function setListenButtonPlayingUI() {
    const listenBtn = document.getElementById("btn-listen-company");
    if (listenBtn) {
      listenBtn.textContent = "Stop Listening";
      listenBtn.setAttribute("aria-pressed", "true");
      listenBtn.setAttribute("aria-busy", "false");
      listenBtn.style.background = "#dc2626";
      listenBtn.style.color = "#ffffff";
    }
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

  function playBrowserSpeechFallback(narration, sessionId) {
    const chunks = splitNarrationSentences(narration);
    if (chunks.length === 0 || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      resetListenButtonUI();
      return;
    }

    setListenButtonPlayingUI();
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const voice = cachedLocalEnVoice || warmUpLocalVoice();

      function speakChunk(idx) {
        if (!window._stocks360IsSpeakingCompany || window._stocks360SpeechSessionId !== sessionId) return;
        if (idx >= chunks.length) {
          resetListenButtonUI();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(chunks[idx]);
        utterance.rate = 0.98;
        utterance.volume = 1.0;
        utterance.pitch = 1.0;
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = "en-US";
        }

        window._stocks360SpeechUtterance = utterance;
        utterance.onend = function () {
          if (!window._stocks360IsSpeakingCompany || window._stocks360SpeechSessionId !== sessionId) return;
          speakChunk(idx + 1);
        };
        utterance.onerror = function (err) {
          if (err && (err.error === "interrupted" || err.error === "canceled")) return;
          resetListenButtonUI();
        };

        window.speechSynthesis.speak(utterance);
      }

      speakChunk(0);

      // Desktop Chromium keep-alive to prevent 15-second utterance cutoff without affecting iOS/Android
      const isMobileUa = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
      if (!isMobileUa) {
        clearSpeechKeepAlive();
        window._stocks360SpeechKeepAliveId = setInterval(() => {
          if (!window._stocks360IsSpeakingCompany || window._stocks360SpeechSessionId !== sessionId) {
            clearSpeechKeepAlive();
            return;
          }
          try {
            if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
              window.speechSynthesis.pause();
              window.speechSynthesis.resume();
            }
          } catch (_) {}
        }, 10000);
      }

      setTimeout(() => {
        if (window._stocks360IsSpeakingCompany && window._stocks360SpeechSessionId === sessionId && window.speechSynthesis.paused) {
          try { window.speechSynthesis.resume(); } catch (_) {}
        }
      }, 120);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
      resetListenButtonUI();
    }
  }

  function toggleCompanyVoiceOverview(stock) {
    // If currently speaking, stop immediately
    if (window._stocks360IsSpeakingCompany) {
      stopCompanyVoiceOverview();
      return;
    }

    const narration = getAboutCompanyNarration(stock);
    if (!narration) return;

    // Record start timestamp so smart-assist.js does not cancel speech on reflexive Ctrl press
    window._stocks360SpeechStartedAt = Date.now();
    window._stocks360IsSpeakingCompany = true;
    const sessionId = (window._stocks360SpeechSessionId || 0) + 1;
    window._stocks360SpeechSessionId = sessionId;

    // Call browser speech synchronously in the exact click tick for zero latency & full iOS/Android user-gesture compliance
    playBrowserSpeechFallback(narration, sessionId);
  }

  function isIndianMarketHours(nowDate) {
    try {
      const dt = nowDate instanceof Date ? nowDate : new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(dt);
      const getVal = (type) => {
        const p = parts.find((x) => x.type === type);
        return p ? p.value : "";
      };
      const wd = getVal("weekday");
      if (wd === "Sat" || wd === "Sun") return false;
      const hr = parseInt(getVal("hour"), 10);
      const min = parseInt(getVal("minute"), 10);
      if (!Number.isFinite(hr) || !Number.isFinite(min)) return false;
      const totalMins = (hr === 24 ? 0 : hr) * 60 + min;
      return totalMins >= 555 && totalMins <= 930; // 09:15 to 15:30 IST
    } catch (_) {
      return false;
    }
  }

  function getQuoteProxyUrl() {
    if (typeof window !== "undefined" && window.STOCKS360_QUOTE_PROXY_URL) {
      return String(window.STOCKS360_QUOTE_PROXY_URL).trim();
    }
    if (typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG && FIREBASE_CONFIG.quoteProxyUrl) {
      return String(FIREBASE_CONFIG.quoteProxyUrl).trim();
    }
    try {
      if (typeof localStorage !== "undefined") {
        const stored = String(localStorage.getItem("stocks360_quote_proxy_url") || "").trim();
        if (stored) return stored;
      }
    } catch (_) {}
    return "https://stocks360-quotes.stocks360-app.workers.dev/quote";
  }

  async function refreshDelayedPriceIfMarketHours(stock, exch) {
    const discEl = document.getElementById("price-delayed-disclaimer");
    if (!stock || !isIndianMarketHours()) {
      if (discEl) discEl.hidden = true;
      return;
    }

    const proxyBase = getQuoteProxyUrl();
    if (!proxyBase || typeof fetch !== "function") {
      if (discEl) discEl.hidden = true;
      return;
    }

    try {
      const sep = proxyBase.includes("?") ? "&" : "?";
      const reqUrl = `${proxyBase}${sep}symbol=${encodeURIComponent(stock.symbol)}&exchange=${encodeURIComponent(exch || "NSE")}${stock.bseCode ? `&bseCode=${encodeURIComponent(stock.bseCode)}` : ""}`;
      const res = await fetch(reqUrl);
      if (!res || !res.ok) return;
      const q = await res.json();
      if (!q || typeof q.cmp !== "number" || !activeCompanyData || activeCompanyData.symbol !== stock.symbol) return;

      const fmtP = (v) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const cmpEl = document.getElementById("company-hero-cmp");
      const pillEl = document.getElementById("company-hero-day-pill");
      const sessEl = document.getElementById("company-hero-session");
      const openEl = document.getElementById("pp-open");
      const highEl = document.getElementById("pp-high");
      const lowEl = document.getElementById("pp-low");
      const prevEl = document.getElementById("pp-prev-close");

      if (cmpEl) cmpEl.textContent = `₹ ${fmtP(q.cmp)}`;
      if (pillEl) {
        const gain = q.dayChange >= 0;
        pillEl.textContent = gain
          ? `+ ₹${Math.abs(q.dayChange).toFixed(2)} (+${Math.abs(q.dayChangePct).toFixed(2)}%) Day Gain`
          : `- ₹${Math.abs(q.dayChange).toFixed(2)} (-${Math.abs(q.dayChangePct).toFixed(2)}%) Day Loss`;
        pillEl.style.background = gain ? "#f0fdf4" : "#fef2f2";
        pillEl.style.color = gain ? "#16a34a" : "#dc2626";
        pillEl.style.borderColor = gain ? "#bbf7d0" : "#fecaca";
      }
      if (sessEl) sessEl.textContent = "(Session: Market Hours • 15-min delayed)";
      if (openEl && typeof q.dayOpen === "number") openEl.textContent = `₹ ${fmtP(q.dayOpen)}`;
      if (highEl && typeof q.dayHigh === "number") highEl.textContent = `₹ ${fmtP(q.dayHigh)}`;
      if (lowEl && typeof q.dayLow === "number") lowEl.textContent = `₹ ${fmtP(q.dayLow)}`;
      if (prevEl && typeof q.prevClose === "number") prevEl.textContent = `₹ ${fmtP(q.prevClose)}`;
      if (discEl) {
        discEl.hidden = false;
        if (typeof discEl.removeAttribute === "function") discEl.removeAttribute("hidden");
      }
    } catch (_) {
      // Quietly fall back to EOD data without showing any error
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
        stopCompanyVoiceOverview();
      }
      stockResult.hidden = true;
      stockResult.style.display = "none";
      stockResult.innerHTML = "";
      if (searchInput) searchInput.value = "";
    }
  });
});
