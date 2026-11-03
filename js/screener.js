/**
 * Stocks 360 - AI & Manual Stock Screener Controller (screener.js)
 * Implements:
 * 1. AI Natural-Language Screener with Interpretation, Edit/Proceed flow, Name, and Public/Private options
 * 2. Manual Screener.in-style Rule & Query Builder
 * 3. Explore Community & Personal Saved Screeners
 * 4. Fast, client-side zero-latency filtering (Zero additional API cost!)
 * 5. Audio readout & WCAG AA/AAA accessibility
 */

const StocksScreener = (function () {
  let activeTab = "ai"; // 'ai', 'manual', 'explore'
  let currentParsedCriteria = null;
  let manualRules = [];
  let savedScreenersCache = [];

  // Default featured community screens for instant discovery
  const FEATURED_SCREENS = [
    {
      id: "featured-1",
      name: "Golden Crossover Breakouts",
      description: "Bullish momentum stocks where short-term 50 DMA is trading above 200 DMA with strong volume.",
      author: "Stocks 360 Research",
      isPublic: true,
      requestedColumns: ["goldenCross", "dma50", "dma200", "volumeSurge"],
      filters: [
        { field: "goldenCross", operator: "==", value: true, label: "Golden Crossover (50 DMA > 200 DMA)" },
        { field: "volumeSurge", operator: ">=", value: 1.15, label: "Volume Surge >= 1.15x" }
      ]
    },
    {
      id: "featured-2",
      name: "High ROE & ROCE Compounders",
      description: "Companies with outstanding capital efficiency (ROE > 18% & ROCE > 20%) and safe conservative leverage.",
      author: "Stocks 360 Research",
      isPublic: true,
      requestedColumns: ["marketCapCr", "roePct", "rocePct", "debtToEquity"],
      filters: [
        { field: "roePct", operator: ">=", value: 18, label: "ROE >= 18%" },
        { field: "rocePct", operator: ">=", value: 20, label: "ROCE >= 20%" },
        { field: "debtToEquity", operator: "<=", value: 0.8, label: "Debt/Equity <= 0.8" }
      ]
    },
    {
      id: "featured-3",
      name: "Low P/E Dividend Payers",
      description: "Value-oriented companies trading at reasonable valuation (P/E < 25) with healthy dividend payouts.",
      author: "Stocks 360 Research",
      isPublic: true,
      requestedColumns: ["pe", "divYieldPct", "marketCapCr"],
      filters: [
        { field: "pe", operator: "<=", value: 25, label: "P/E <= 25" },
        { field: "divYieldPct", operator: ">=", value: 1.2, label: "Dividend Yield >= 1.2%" }
      ]
    },
    {
      id: "featured-4",
      name: "Virtually Debt-Free Growth Leaders",
      description: "Fast-growing market leaders with almost zero debt (Debt/Eq <= 0.1) and strong sales momentum.",
      author: "Stocks 360 Research",
      isPublic: true,
      requestedColumns: ["debtToEquity", "roePct", "salesGrowth3Y"],
      filters: [
        { field: "debtToEquity", operator: "<=", value: 0.1, label: "Debt/Equity <= 0.1" },
        { field: "roePct", operator: ">=", value: 15, label: "ROE >= 15%" },
        { field: "salesGrowth3Y", operator: ">=", value: 10, label: "3Y Sales Growth >= 10%" }
      ]
    }
  ];

  function init() {
    setupTabNavigation();
    setupAiScreener();
    setupManualScreener();
    setupExploreSection();
    loadSavedScreeners();
    syncFromFirestoreSingleDoc();

    // Check hash for direct tab navigation
    const hash = window.location.hash;
    if (hash === "#tab-manual") {
      switchTab("manual");
    } else if (hash === "#tab-explore" || hash === "#tab-saved") {
      switchTab("explore");
    } else {
      switchTab("ai");
    }
  }

  // ---------- TAB NAVIGATION ----------
  function setupTabNavigation() {
    const tabs = document.querySelectorAll(".screener-nav-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", function () {
        const target = this.getAttribute("data-tab");
        if (target) {
          switchTab(target);
        }
      });
    });
  }

  function switchTab(tabKey) {
    activeTab = tabKey;
    document.querySelectorAll(".screener-nav-tab").forEach((btn) => {
      const match = btn.getAttribute("data-tab") === tabKey;
      btn.classList.toggle("active", match);
      btn.setAttribute("aria-selected", match ? "true" : "false");
    });

    document.querySelectorAll(".screener-panel").forEach((panel) => {
      panel.hidden = panel.id !== `panel-${tabKey}`;
    });

    if (tabKey === "explore") {
      renderExploreCards();
    }
  }

  // ---------- AI SCREENER SECTION ----------
  function setupAiScreener() {
    const toggleBtn = document.getElementById("ai-screener-toggle-btn");
    const drawer = document.getElementById("ai-screener-drawer");
    const promptInput = document.getElementById("ai-screener-prompt");
    const sendBtn = document.getElementById("ai-screener-send-btn");
    const examplePills = document.querySelectorAll(".ai-prompt-pill");

    const interpretationCard = document.getElementById("ai-interpretation-card");
    const interpretationText = document.getElementById("ai-interpretation-text");
    const editBtn = document.getElementById("ai-edit-criteria-btn");
    const proceedBtn = document.getElementById("ai-proceed-btn");

    const saveForm = document.getElementById("ai-screener-save-form");
    const runBtn = document.getElementById("ai-run-save-btn");

    if (toggleBtn && drawer) {
      toggleBtn.addEventListener("click", () => {
        const isHidden = drawer.hidden;
        drawer.hidden = !isHidden;
        toggleBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
        if (isHidden && promptInput) {
          promptInput.focus();
        }
      });
    }

    // Quick starter examples
    examplePills.forEach((pill) => {
      pill.addEventListener("click", function () {
        if (promptInput) {
          promptInput.value = this.getAttribute("data-prompt") || this.textContent.trim();
          promptInput.focus();
        }
      });
    });

    if (sendBtn && promptInput) {
      sendBtn.addEventListener("click", handleAiScreenerSend);
      promptInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleAiScreenerSend();
        }
      });
    }

    if (editBtn) {
      editBtn.addEventListener("click", () => {
        if (interpretationCard) interpretationCard.hidden = true;
        if (saveForm) saveForm.hidden = true;
        if (promptInput) {
          promptInput.focus();
          promptInput.select();
        }
      });
    }

    if (proceedBtn) {
      proceedBtn.addEventListener("click", () => {
        // Require user authentication before naming/saving screener
        if (typeof StocksAuth !== "undefined") {
          StocksAuth.requireAuth(() => {
            showSaveConfigurationForm();
          });
        } else {
          showSaveConfigurationForm();
        }
      });
    }

    if (runBtn) {
      runBtn.addEventListener("click", handleRunAndSaveAiScreen);
    }
  }

  async function handleAiScreenerSend() {
    const promptInput = document.getElementById("ai-screener-prompt");
    const sendBtn = document.getElementById("ai-screener-send-btn");
    const interpretationCard = document.getElementById("ai-interpretation-card");
    const interpretationText = document.getElementById("ai-interpretation-text");
    const saveForm = document.getElementById("ai-screener-save-form");

    if (!promptInput) return;
    const userWords = promptInput.value.trim();
    if (!userWords) {
      alert("Please enter what kind of companies or indicators you want to screen.");
      promptInput.focus();
      return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span>Interpreting with Stocks 360 AI...</span>`;

    try {
      if (typeof StocksGeminiAI !== "undefined") {
        currentParsedCriteria = await StocksGeminiAI.parseScreenerQuery(userWords);
      }
    } catch (e) {
      console.warn("AI interpretation failed, using fallback:", e);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<span>Generate Screener</span> &rarr;`;
    }

    if (!currentParsedCriteria) {
      alert("Could not process query. Please try rephrasing.");
      return;
    }

    if (interpretationCard && interpretationText) {
      interpretationText.textContent = currentParsedCriteria.interpretation;
      interpretationCard.hidden = false;
      if (saveForm) saveForm.hidden = true;
      interpretationCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function showSaveConfigurationForm() {
    const saveForm = document.getElementById("ai-screener-save-form");
    const nameInput = document.getElementById("ai-screen-name");
    const descInput = document.getElementById("ai-screen-desc");

    if (!saveForm || !currentParsedCriteria) return;

    if (nameInput) {
      nameInput.value = currentParsedCriteria.suggestedName || "My Custom Stock Screener";
    }
    if (descInput) {
      descInput.value = currentParsedCriteria.suggestedDescription || "";
    }

    saveForm.hidden = false;
    saveForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function handleRunAndSaveAiScreen() {
    if (!currentParsedCriteria) return;

    const nameInput = document.getElementById("ai-screen-name");
    const descInput = document.getElementById("ai-screen-desc");
    const publicCheckbox = document.getElementById("ai-screen-public");

    const screenName = (nameInput ? nameInput.value.trim() : "") || "Stocks 360 Strategy";
    const screenDesc = descInput ? descInput.value.trim() : "";
    const isPublic = publicCheckbox ? publicCheckbox.checked : false;

    const user = typeof StocksAuth !== "undefined" ? StocksAuth.getCurrentUser() : null;

    const screenObj = {
      id: "screen_" + Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 4),
      userId: user ? user.uid : "guest",
      author: user ? (user.displayName || user.email.split("@")[0]) : "Learner",
      name: screenName,
      description: screenDesc,
      isPublic: isPublic,
      requestedColumns: currentParsedCriteria.requestedColumns || [],
      filters: currentParsedCriteria.filters || [],
      createdAt: Date.now()
    };

    // Save to Firestore & local state
    await persistScreener(screenObj);

    // Execute and render the results table
    renderScreenerResults(screenObj);
  }

  // ---------- PERSISTENCE (FIRESTORE & LOCAL) ----------
  async function persistScreener(screenObj) {
    savedScreenersCache.unshift(screenObj);
    try {
      localStorage.setItem("stocks360_saved_screeners", JSON.stringify(savedScreenersCache));
    } catch (_) {}

    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
      try {
        await StocksFirebase.getDb()
          .collection("screeners")
          .doc(screenObj.id)
          .set(screenObj);
      } catch (e) {
        console.warn("Failed to save screener in Firestore:", e);
      }
    }
  }

  async function loadSavedScreeners() {
    try {
      const local = JSON.parse(localStorage.getItem("stocks360_saved_screeners") || "[]");
      savedScreenersCache = local;
    } catch (_) {}

    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
      try {
        const snap = await Promise.race([
          StocksFirebase.getDb().collection("screeners").limit(50).get(),
          new Promise((resolve) => setTimeout(() => resolve(null), 2500))
        ]);
        if (snap && !snap.empty) {
          const list = [];
          snap.forEach((doc) => list.push(doc.data()));
          savedScreenersCache = list;
          try {
            localStorage.setItem("stocks360_saved_screeners", JSON.stringify(list));
          } catch (_) {}
        }
      } catch (_) {}
    }
  }

  async function syncFromFirestoreSingleDoc() {
    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
      try {
        const doc = await Promise.race([
          StocksFirebase.getDb().collection("site_settings").doc("stock_screener_data").get(),
          new Promise((resolve) => setTimeout(() => resolve(null), 1800))
        ]);
        if (doc && doc.exists) {
          const data = doc.data();
          if (data && data.stocksJson) {
            const parsed = JSON.parse(data.stocksJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              window.STOCKS_SCREENER_DATASET = parsed;
            }
          }
        }
      } catch (_) {}
    }
  }

  // ---------- SCREENER EXECUTION & TABLE RENDERING ----------
  function executeFilters(stocks, filters) {
    if (!Array.isArray(filters) || filters.length === 0) {
      return stocks;
    }

    return stocks.filter((stock) => {
      return filters.every((rule) => {
        const field = rule.field;
        const op = rule.operator;
        const targetVal = rule.value;

        // Custom computed checks
        if (field === "cmp_vs_dma200") {
          return op === ">" ? stock.cmp > stock.dma200 : stock.cmp <= stock.dma200;
        }
        if (field === "cmp_vs_dma50") {
          return op === ">" ? stock.cmp > stock.dma50 : stock.cmp <= stock.dma50;
        }

        const stockVal = stock[field];
        if (stockVal === undefined || stockVal === null) return false;

        switch (op) {
          case ">":
            return Number(stockVal) > Number(targetVal);
          case ">=":
            return Number(stockVal) >= Number(targetVal);
          case "<":
            return Number(stockVal) < Number(targetVal);
          case "<=":
            return Number(stockVal) <= Number(targetVal);
          case "==":
          case "=":
            if (typeof stockVal === "string") {
              return String(stockVal).toLowerCase() === String(targetVal).toLowerCase();
            }
            return stockVal === targetVal;
          default:
            return true;
        }
      });
    });
  }

  function renderScreenerResults(screenObj) {
    const resultsContainer = document.getElementById("screener-results-section");
    if (!resultsContainer) return;

    resultsContainer.hidden = false;
    resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });

    const dataset = (typeof STOCKS_SCREENER_DATASET !== "undefined") ? STOCKS_SCREENER_DATASET : [];
    const matchedStocks = executeFilters(dataset, screenObj.filters);

    // Dynamic Columns:
    // User Requirement: "fetch only the filters the user asked and along with that it has to fetch the current market price which was last updated"
    const requestedCols = Array.isArray(screenObj.requestedColumns) ? screenObj.requestedColumns : [];
    
    // Always included fixed core columns:
    const baseColumns = [
      { key: "symbol", label: "Symbol / Company", category: "core" },
      { key: "cmp", label: "Current Market Price (CMP)", category: "price" }
    ];

    // Requested custom filter columns
    const dynamicColumns = [];
    const seen = new Set(["symbol", "cmp", "name"]);

    requestedCols.forEach((colKey) => {
      if (!seen.has(colKey) && SCREENER_METRIC_DEFINITIONS[colKey]) {
        seen.add(colKey);
        dynamicColumns.push({
          key: colKey,
          label: SCREENER_METRIC_DEFINITIONS[colKey].label,
          unit: SCREENER_METRIC_DEFINITIONS[colKey].unit
        });
      }
    });

    // Also include any fields explicitly filtered on if not already present
    (screenObj.filters || []).forEach((rule) => {
      const field = rule.field;
      if (!seen.has(field) && SCREENER_METRIC_DEFINITIONS[field]) {
        seen.add(field);
        dynamicColumns.push({
          key: field,
          label: SCREENER_METRIC_DEFINITIONS[field].label,
          unit: SCREENER_METRIC_DEFINITIONS[field].unit
        });
      }
    });

    const activeCols = baseColumns.concat(dynamicColumns);

    // Build Accessible HTML Table
    let tableRows = "";
    if (matchedStocks.length === 0) {
      tableRows = `
        <tr>
          <td colspan="${activeCols.length}" style="text-align:center; padding:32px 16px; color:#64748b;">
            <p style="font-size:1.1rem; font-weight:600; color:#1e293b; margin-bottom:6px;">No stocks currently match all criteria</p>
            <p style="font-size:0.92rem;">Try relaxing your thresholds (e.g. lowering ROE/ROCE or removing restrictive filters).</p>
          </td>
        </tr>
      `;
    } else {
      tableRows = matchedStocks
        .map((st, idx) => {
          let cells = "";
          activeCols.forEach((col) => {
            if (col.key === "symbol") {
              cells += `
                <td style="font-weight:700; color:#1e293b;">
                  <div><a href="index.html?symbol=${encodeURIComponent(st.symbol)}" style="color:#2563eb; text-decoration:none; font-weight:700;" title="View detailed analysis for ${escapeHtml(st.name)}">${escapeHtml(st.symbol)} &rarr;</a></div>
                  <div style="font-size:0.8rem; font-weight:400; color:#64748b;">${escapeHtml(st.name)}</div>
                </td>
              `;
            } else if (col.key === "cmp") {
              cells += `
                <td style="font-weight:700; color:#2563eb; white-space:nowrap;">
                  <div>₹${st.cmp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  <div style="font-size:0.75rem; font-weight:400; color:#64748b;">Last Updated: ${escapeHtml(st.lastUpdated)}</div>
                </td>
              `;
            } else if (col.key === "goldenCross") {
              cells += `
                <td>
                  <span class="badge ${st.goldenCross ? "badge-success" : "badge-neutral"}" style="font-size:0.8rem; padding:4px 8px; border-radius:4px;">
                    ${st.goldenCross ? "Active Bullish" : "Inactive"}
                  </span>
                </td>
              `;
            } else {
              const val = st[col.key];
              let formatted = "--";
              if (val !== undefined && val !== null) {
                if (typeof val === "number") {
                  formatted = val.toLocaleString("en-IN") + (col.unit && col.unit !== "₹" && col.unit !== "x" ? " " + col.unit : (col.unit === "%" ? "%" : ""));
                } else {
                  formatted = String(val);
                }
              }
              cells += `<td>${escapeHtml(formatted)}</td>`;
            }
          });
          return `<tr class="${idx % 2 === 0 ? "even" : "odd"}">${cells}</tr>`;
        })
        .join("");
    }

    const appliedFiltersBadges = (screenObj.filters || [])
      .map(
        (f) =>
          `<span class="filter-pill-badge" style="display:inline-block; font-size:0.82rem; padding:4px 10px; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:999px; margin:2px 4px 2px 0;">${escapeHtml(
            f.label || f.field
          )}</span>`
      )
      .join("");

    resultsContainer.innerHTML = `
      <div class="results-header-box" style="margin-bottom: 18px; padding: 18px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge ${screenObj.isPublic ? "badge-success" : "badge-neutral"}" style="font-size:0.75rem;">
                ${screenObj.isPublic ? "🌐 Public Community Screen" : "🔒 Private Screen"}
              </span>
              <span style="font-size:0.82rem; color:#64748b;">Created by <strong>${escapeHtml(screenObj.author || "Learner")}</strong></span>
            </div>
            <h2 id="screener-results-title" style="margin-top:6px; font-size:1.45rem; color:#0f172a;">${escapeHtml(screenObj.name)}</h2>
            ${screenObj.description ? `<p style="color:#475569; font-size:0.95rem; margin-top:4px;">${escapeHtml(screenObj.description)}</p>` : ""}
          </div>
          
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-secondary" id="btn-audio-read-results" aria-label="Listen to screener results summary">
              🔊 Read Results Aloud
            </button>
            <button type="button" class="btn-primary" id="btn-save-as-mine">
              &starf; Save to My Screens
            </button>
          </div>
        </div>

        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f5f9;">
          <strong style="font-size:0.85rem; color:#64748b;">Applied Screen Rules:</strong>
          <div style="margin-top:6px;">${appliedFiltersBadges || "<span style='color:#64748b;'>None</span>"}</div>
        </div>

        <div style="margin-top: 10px; font-size: 0.95rem; font-weight: 600; color: #1e293b;">
          Found <span style="color:#2563eb;">${matchedStocks.length}</span> companies matching your criteria out of ${dataset.length} stocks.
        </div>
      </div>

      <!-- ACCESSIBLE RESPONSIVE DATA TABLE -->
      <div class="table-responsive-wrapper" tabindex="0" role="region" aria-labelledby="screener-results-title" style="overflow-x:auto; background:#ffffff; border-radius:12px; border:1px solid #e2e8f0;">
        <table class="stocks360-data-table" style="width:100%; border-collapse:collapse; font-size:0.94rem;">
          <caption class="sr-only">Stock Screener Results for ${escapeHtml(screenObj.name)}</caption>
          <thead>
            <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1; text-align:left;">
              ${activeCols
                .map(
                  (c) =>
                    `<th scope="col" style="padding:12px 14px; font-weight:700; color:#334155; white-space:nowrap;">${escapeHtml(
                      c.label
                    )}</th>`
                )
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;

    // Audio read aloud for accessibility
    const audioBtn = document.getElementById("btn-audio-read-results");
    if (audioBtn) {
      audioBtn.addEventListener("click", () => {
        const summaryText = `Screener results for ${screenObj.name}. Found ${matchedStocks.length} matching companies. Top matches include ${matchedStocks.slice(0, 3).map((s) => s.name + " at " + s.cmp + " rupees").join(", ")}.`;
        if (typeof window.speakWithPitch === "function") {
          window.speakWithPitch(summaryText, true);
        } else if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(summaryText);
          window.speechSynthesis.speak(u);
        }
      });
    }

    const saveMineBtn = document.getElementById("btn-save-as-mine");
    if (saveMineBtn) {
      saveMineBtn.addEventListener("click", () => {
        if (typeof StocksAuth !== "undefined") {
          StocksAuth.requireAuth(async (user) => {
            const clone = Object.assign({}, screenObj, {
              id: "screen_" + Date.now().toString(36),
              userId: user.uid,
              author: user.displayName || user.email.split("@")[0],
              createdAt: Date.now()
            });
            await persistScreener(clone);
            alert("Saved to your personal screeners list!");
          });
        }
      });
    }
  }

  // ---------- MANUAL SCREENER (SCREENER.IN STYLE) ----------
  function setupManualScreener() {
    const addRuleBtn = document.getElementById("manual-add-rule-btn");
    const runBtn = document.getElementById("manual-run-btn");
    const saveBtn = document.getElementById("manual-save-btn");
    const clearBtn = document.getElementById("manual-clear-btn");

    if (addRuleBtn) {
      addRuleBtn.addEventListener("click", () => addManualRuleRow());
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        manualRules = [];
        renderManualRuleRows();
      });
    }

    if (runBtn) {
      runBtn.addEventListener("click", () => {
        const screenObj = extractManualScreenObj();
        if (screenObj.filters.length === 0) {
          alert("Please add at least one rule to run the screener.");
          return;
        }
        renderScreenerResults(screenObj);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        if (typeof StocksAuth !== "undefined") {
          StocksAuth.requireAuth(() => {
            const screenObj = extractManualScreenObj();
            const name = prompt("Enter a name for this screener:", "My Custom Strategy");
            if (!name) return;
            screenObj.name = name;
            screenObj.isPublic = confirm("Do you want to publish this screener to the public community?\n\nClick OK for Public, Cancel for Private.");
            persistScreener(screenObj);
            renderScreenerResults(screenObj);
          });
        }
      });
    }

    // Initialize with 2 starter rules (Market Cap & ROE)
    manualRules = [
      { field: "marketCapCr", operator: ">=", value: 5000 },
      { field: "roePct", operator: ">=", value: 15 }
    ];
    renderManualRuleRows();
  }

  function addManualRuleRow(field = "roePct", operator = ">=", value = 15) {
    manualRules.push({ field: field, operator: operator, value: value });
    renderManualRuleRows();
  }

  function renderManualRuleRows() {
    const container = document.getElementById("manual-rules-container");
    if (!container) return;

    if (manualRules.length === 0) {
      container.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #64748b; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
          No filter rules added yet. Click <strong>"Add Condition / Indicator"</strong> below to begin.
        </div>
      `;
      return;
    }

    const metricOptions = Object.keys(SCREENER_METRIC_DEFINITIONS)
      .map(
        (key) =>
          `<option value="${key}">${SCREENER_METRIC_DEFINITIONS[key].label}</option>`
      )
      .join("");

    container.innerHTML = manualRules
      .map((rule, idx) => {
        return `
          <div class="manual-rule-row" data-index="${idx}" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:12px; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
            <div style="flex: 2; min-width: 220px;">
              <label for="manual-metric-${idx}" class="sr-only">Metric or Indicator</label>
              <select id="manual-metric-${idx}" class="form-select rule-metric-select" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1;">
                ${metricOptions}
              </select>
            </div>

            <div style="flex: 1; min-width: 90px;">
              <label for="manual-op-${idx}" class="sr-only">Operator</label>
              <select id="manual-op-${idx}" class="form-select rule-op-select" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1;">
                <option value=">=">&gt;= (Greater or Equal)</option>
                <option value=">">&gt; (Greater than)</option>
                <option value="<=">&lt;= (Less or Equal)</option>
                <option value="<">&lt; (Less than)</option>
                <option value="==">= (Equal to)</option>
              </select>
            </div>

            <div style="flex: 1.5; min-width: 140px;">
              <label for="manual-val-${idx}" class="sr-only">Target Value</label>
              <input type="text" id="manual-val-${idx}" class="form-input rule-val-input" value="${rule.value !== undefined ? rule.value : ""}" placeholder="e.g. 15" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1;">
            </div>

            <button type="button" class="btn-remove-rule" data-index="${idx}" aria-label="Remove this condition" style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; padding:8px 12px; border-radius:6px; cursor:pointer; font-weight:700;">
              &times;
            </button>
          </div>
        `;
      })
      .join("");

    // Set select values
    manualRules.forEach((rule, idx) => {
      const metricEl = document.getElementById(`manual-metric-${idx}`);
      const opEl = document.getElementById(`manual-op-${idx}`);
      if (metricEl) metricEl.value = rule.field;
      if (opEl) opEl.value = rule.operator;
    });

    // Wire change handlers
    container.querySelectorAll(".rule-metric-select").forEach((sel) => {
      sel.addEventListener("change", function () {
        const idx = parseInt(this.closest(".manual-rule-row").getAttribute("data-index"), 10);
        manualRules[idx].field = this.value;
      });
    });

    container.querySelectorAll(".rule-op-select").forEach((sel) => {
      sel.addEventListener("change", function () {
        const idx = parseInt(this.closest(".manual-rule-row").getAttribute("data-index"), 10);
        manualRules[idx].operator = this.value;
      });
    });

    container.querySelectorAll(".rule-val-input").forEach((inp) => {
      inp.addEventListener("input", function () {
        const idx = parseInt(this.closest(".manual-rule-row").getAttribute("data-index"), 10);
        const val = this.value.trim();
        manualRules[idx].value = isNaN(val) ? val : parseFloat(val);
      });
    });

    container.querySelectorAll(".btn-remove-rule").forEach((btn) => {
      btn.addEventListener("click", function () {
        const idx = parseInt(this.getAttribute("data-index"), 10);
        manualRules.splice(idx, 1);
        renderManualRuleRows();
      });
    });
  }

  function extractManualScreenObj() {
    const filters = [];
    const requestedColumns = [];

    manualRules.forEach((r) => {
      const def = SCREENER_METRIC_DEFINITIONS[r.field];
      const label = def ? `${def.label} ${r.operator} ${r.value}` : `${r.field} ${r.operator} ${r.value}`;
      filters.push({
        field: r.field,
        operator: r.operator,
        value: r.value,
        label: label
      });
      requestedColumns.push(r.field);
    });

    return {
      id: "manual_" + Date.now().toString(36),
      name: "Manual Filter Strategy",
      description: "Custom rule-based screen created via rule builder.",
      isPublic: false,
      author: "Learner",
      requestedColumns: requestedColumns,
      filters: filters
    };
  }

  // ---------- EXPLORE COMMUNITY & SAVED SCREENS ----------
  function setupExploreSection() {
    // Handled in renderExploreCards
  }

  function renderExploreCards() {
    const featuredGrid = document.getElementById("explore-featured-grid");
    const communityGrid = document.getElementById("explore-community-grid");
    const savedGrid = document.getElementById("explore-saved-grid");

    const user = typeof StocksAuth !== "undefined" ? StocksAuth.getCurrentUser() : null;

    // 1. Featured Screens
    if (featuredGrid) {
      featuredGrid.innerHTML = FEATURED_SCREENS.map((s) => buildScreenCardHtml(s)).join("");
    }

    // 2. Community Public Screens
    if (communityGrid) {
      const publicScreens = savedScreenersCache.filter((s) => s.isPublic);
      if (publicScreens.length === 0) {
        communityGrid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: #64748b; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
            No community public screeners published yet. Be the first learner to publish an AI strategy!
          </div>
        `;
      } else {
        communityGrid.innerHTML = publicScreens.map((s) => buildScreenCardHtml(s)).join("");
      }
    }

    // 3. User Saved Screens
    if (savedGrid) {
      if (!user) {
        savedGrid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 24px; text-align: center; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
            <p style="font-weight:600; color:#1e293b; margin-bottom:6px;">Sign in to view and run your private saved screeners</p>
            <p style="font-size:0.92rem; color:#64748b; margin-bottom:14px;">Your personalized strategies are saved safely to your account.</p>
            <button type="button" class="btn-primary" onclick="StocksAuth.showAuthModal('signin')">Sign In to Your Account</button>
          </div>
        `;
      } else {
        const userScreens = savedScreenersCache.filter((s) => s.userId === user.uid);
        if (userScreens.length === 0) {
          savedGrid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: #64748b; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
              You haven't saved any screeners yet. Use the <strong>"Create Screener with AI"</strong> tab to build your first one!
            </div>
          `;
        } else {
          savedGrid.innerHTML = userScreens.map((s) => buildScreenCardHtml(s)).join("");
        }
      }
    }

    // Attach click listeners to all screen cards
    document.querySelectorAll(".screen-explore-card").forEach((card) => {
      card.addEventListener("click", function () {
        const screenId = this.getAttribute("data-id");
        const found =
          FEATURED_SCREENS.find((s) => s.id === screenId) ||
          savedScreenersCache.find((s) => s.id === screenId);
        if (found) {
          renderScreenerResults(found);
        }
      });
    });
  }

  function buildScreenCardHtml(screen) {
    const rulesCount = (screen.filters || []).length;
    return `
      <div class="screen-explore-card" data-id="${screen.id}" tabindex="0" role="button" style="background:#ffffff; padding:18px; border-radius:12px; border:1px solid #e2e8f0; cursor:pointer; transition:transform 0.15s ease, box-shadow 0.15s ease; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span class="badge ${screen.isPublic ? "badge-success" : "badge-neutral"}" style="font-size:0.75rem;">
            ${screen.isPublic ? "Public" : "Private"}
          </span>
          <span style="font-size:0.8rem; color:#64748b;">${rulesCount} Rules</span>
        </div>
        <h3 style="font-size:1.15rem; color:#0f172a; margin-bottom:6px;">${escapeHtml(screen.name)}</h3>
        <p style="font-size:0.88rem; color:#64748b; line-height:1.5; margin-bottom:12px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
          ${escapeHtml(screen.description || "Custom fundamental and technical screening strategy.")}
        </p>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; color:#2563eb; font-weight:600; padding-top:8px; border-top:1px solid #f1f5f9;">
          <span>Run Screen &rarr;</span>
          <span style="color:#64748b; font-weight:400;">by ${escapeHtml(screen.author || "Learner")}</span>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    init: init,
    switchTab: switchTab,
    renderScreenerResults: renderScreenerResults
  };
})();

if (typeof window !== "undefined") {
  window.StocksScreener = StocksScreener;
}
