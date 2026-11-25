// main.js
// Common functions and Stock 360 AI assistant controller for Stocks 360

document.addEventListener("DOMContentLoaded", function () {
  const skipLink = document.querySelector(".skip-link");
  if (skipLink) {
    skipLink.addEventListener("click", function () {
      const targetHref = skipLink.getAttribute("href");

      // Only on index.html where href="#home-nav-link"
      if (targetHref === "#home-nav-link") {
        const homeNavLink = document.getElementById("home-nav-link");
        if (homeNavLink) {
          homeNavLink.focus();
          homeNavLink.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        return;
      }

      // On all subpages (News, Newsletter, Learn, About, Contact):
      // Jump directly to the visible page/article heading inside #main-content
      const candidateIds = ["detail-title", "nl-detail-title", "subunit-title", "unit-title", "page-heading"];
      let focusTarget = null;
      for (let i = 0; i < candidateIds.length; i++) {
        const el = document.getElementById(candidateIds[i]);
        if (el && !el.hidden && el.offsetParent !== null) {
          focusTarget = el;
          break;
        }
      }

      if (!focusTarget) {
        focusTarget = document.getElementById("page-heading") || document.getElementById("main-content");
      }

      if (focusTarget) {
        if (!focusTarget.hasAttribute("tabindex")) {
          focusTarget.setAttribute("tabindex", "-1");
        }
        if (focusTarget.id) {
          skipLink.setAttribute("href", "#" + focusTarget.id);
        }
        setTimeout(function () {
          focusTarget.focus();
          focusTarget.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 10);
      }
    });
  }

  // Top Stock 360 AI drawer toggle & response handler
  const askBtn = document.getElementById("home-ask360-btn");
  const askDrawer = document.getElementById("home-ask360-drawer");
  const askInput = document.getElementById("home-ask360-input");
  const askSend = document.getElementById("home-ask360-send");
  const askResponse = document.getElementById("home-ask360-response");

  if (askBtn && askDrawer) {
    askBtn.addEventListener("click", function () {
      const isHidden = askDrawer.hidden;
      askDrawer.hidden = !isHidden;
      askBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
      if (isHidden) {
        if (askResponse && !askResponse.innerHTML.trim()) {
          renderStarterPrompts();
        }
        if (askInput) {
          askInput.focus();
        }
      }
    });
  }

  function renderStarterPrompts() {
    if (!askResponse) return;
    const starters = [
      "How is the market moving this week?",
      "How do global cues affect Indian markets?",
      "Why do Banking and IT drive Nifty 50?"
    ];
    askResponse.innerHTML = `
      <div class="ai-starter-chips" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
        ${starters
          .map(
            (s) =>
              `<button type="button" class="quick-ticker-pill home-ai-starter" data-prompt="${s}" style="border-radius:999px; font-size:0.86rem; padding:6px 14px;">${s}</button>`
          )
          .join("")}
      </div>
    `;
    askResponse.querySelectorAll(".home-ai-starter").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const promptText = this.getAttribute("data-prompt");
        if (askInput && promptText) {
          askInput.value = promptText;
          handleTopAsk360();
        }
      });
    });
  }

  async function handleTopAsk360() {
    if (!askInput || !askResponse) return;
    const q = askInput.value.trim();
    if (!q) {
      askResponse.innerHTML = `<p class="ask360-error">Type any question to start chatting with Stocks 360 AI.</p>`;
      return;
    }

    askInput.value = "";
    askInput.placeholder = "Ask a follow-up question about the market...";
    const existingStream = askResponse.querySelector(".ai-chat-stream");
    if (existingStream) {
      const tempTurn = document.createElement("div");
      tempTurn.style.marginBottom = "10px";
      tempTurn.innerHTML = `<p style="color:#2563eb; font-size:0.9rem; font-weight:500; margin:6px 0;">Thinking...</p>`;
      existingStream.appendChild(tempTurn);
      existingStream.scrollTop = existingStream.scrollHeight;
    } else {
      askResponse.innerHTML = `<div class="ask360-ai-card" style="padding:12px 16px;"><p style="color:#2563eb; font-weight:500; margin:0;">Thinking...</p></div>`;
    }

    if (typeof StocksGeminiAI !== "undefined") {
      const result = await StocksGeminiAI.askGeneralMarketTrends(q);
      if (result) {
        StocksGeminiAI.renderAiResponseCard(askResponse, result, function (followUpQ) {
          askInput.value = followUpQ;
          handleTopAsk360();
        });
        return;
      }
    }

    const safeQ = q.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fallbackAnswer =
      "Right now, market movements are largely driven by corporate earnings, Banking and IT sector flows, and global interest rate cues.";
    askResponse.innerHTML = `
      <div class="ask360-ai-card" tabindex="-1">
        <p class="ai-answer-text">${fallbackAnswer}</p>
      </div>
    `;
  }

  if (askSend) {
    askSend.addEventListener("click", handleTopAsk360);
  }

  if (askInput) {
    askInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTopAsk360();
      }
    });
  }

  // =========================================================================
  // Global Auto-Collapse Controller for ALL Ask 360 AI Boxes Across the Site
  // Collapses the expanded AI box back into a button when:
  // 1. User presses Escape
  // 2. User clicks outside the AI box / trigger button with the mouse
  // 3. User navigates / moves focus outside the AI box to another area
  // =========================================================================
  const AI_PAIRS = [
    { btnId: "home-ask360-btn", boxId: "home-ask360-drawer" },
    { btnId: "detail-ask360-btn", boxId: "detail-ask360-box" },
    { btnId: "nl-ask360-btn", boxId: "nl-ask360-box" },
    { btnId: "learn-ask360-btn", boxId: "learn-ask360-box" }
  ];

  function collapseAiPair(pair, returnFocusToBtn) {
    const btn = document.getElementById(pair.btnId);
    const box = document.getElementById(pair.boxId);
    if (!box || box.hidden) return;

    box.hidden = true;
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      if (returnFocusToBtn) {
        btn.focus();
      }
    }
  }

  function isInsideAiPair(pair, targetNode) {
    if (!targetNode) return false;
    const btn = document.getElementById(pair.btnId);
    const box = document.getElementById(pair.boxId);
    return Boolean((btn && btn.contains(targetNode)) || (box && box.contains(targetNode)));
  }

  // 1. Press Escape -> collapse open AI box and return focus to its Ask 360 AI button
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.key === "Esc") {
      AI_PAIRS.forEach(function (pair) {
        const box = document.getElementById(pair.boxId);
        if (box && !box.hidden) {
          e.preventDefault();
          collapseAiPair(pair, true);
        }
      });
    }
  });

  // 2. Click outside with mouse -> collapse open AI box back into button
  document.addEventListener("mousedown", function (e) {
    AI_PAIRS.forEach(function (pair) {
      const box = document.getElementById(pair.boxId);
      if (box && !box.hidden && !isInsideAiPair(pair, e.target)) {
        collapseAiPair(pair, false);
      }
    });
  });

  // 3. Navigate / Tab / Focus to another area outside the AI box -> collapse open AI box
  document.addEventListener("focusin", function (e) {
    AI_PAIRS.forEach(function (pair) {
      const box = document.getElementById(pair.boxId);
      if (box && !box.hidden && !isInsideAiPair(pair, e.target)) {
        collapseAiPair(pair, false);
      }
    });
  });

  AI_PAIRS.forEach(function (pair) {
    const box = document.getElementById(pair.boxId);
    if (!box) return;
    if (!box.hasAttribute("tabindex")) {
      box.setAttribute("tabindex", "-1");
    }
    box.addEventListener("focusout", function () {
      setTimeout(function () {
        const active = document.activeElement;
        if ( active && active !== document.body && !isInsideAiPair(pair, active) ) {
          collapseAiPair(pair, false);
        }
      }, 80);
    });
  });

  // 4. Homepage 3-Indices Strip (NIFTY 50, SENSEX, BANK NIFTY) - 15-Minute Delayed Quotes
  (function initHomeIndicesStrip() {
    const listEl = document.getElementById("home-indices-list");
    const metaEl = document.getElementById("home-indices-meta");
    if (!listEl) return;

    const CACHE_KEY = "stocks360_home_indices_cache_v1";
    const REFRESH_MS = 15 * 60 * 1000; // 15 minutes
    const PROXY_BASE = "https://stocks360-quotes.stocks360-app.workers.dev/quote";

    const KEY_INDICES = [
      { label: "NIFTY 50", symbol: "^NSEI" },
      { label: "SENSEX", symbol: "^BSESN" },
      { label: "BANK NIFTY", symbol: "^NSEBANK" }
    ];

    function isMarketHoursIST() {
      try {
        const now = new Date();
        const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const day = ist.getDay();
        if (day === 0 || day === 6) return false;
        const mins = ist.getHours() * 60 + ist.getMinutes();
        return mins >= 555 && mins <= 930; // 09:15 to 15:30 IST
      } catch (_) {
        return false;
      }
    }

    function isEodSyncedForToday() {
      try {
        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kolkata",
          month: "short",
          day: "2-digit"
        }).formatToParts(now);
        const day = (parts.find((p) => p.type === "day") || {}).value || "";
        const month = (parts.find((p) => p.type === "month") || {}).value || "";
        const dayNoPad = String(parseInt(day, 10));
        const ds = typeof window !== "undefined" && Array.isArray(window.STOCKS_SCREENER_DATASET)
          ? window.STOCKS_SCREENER_DATASET
          : null;
        if (ds && ds.length > 0) {
          for (let i = 0; i < Math.min(5, ds.length); i++) {
            const lu = String((ds[i] && ds[i].lastUpdated) || "");
            if (lu && (lu.includes(`(${day} ${month})`) || lu.includes(`(${dayNoPad} ${month})`))) {
              return true;
            }
          }
        }
      } catch (_) {}
      return false;
    }

    function shouldUseDelayedIndicesToday() {
      try {
        const now = new Date();
        const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const day = ist.getDay();
        if (day === 0 || day === 6) return false;
        const mins = ist.getHours() * 60 + ist.getMinutes();
        if (mins < 555) return false; // Before 09:15 IST
        if (isEodSyncedForToday()) return false; // Automated EOD workflow already synced today
        return true;
      } catch (_) {
        return false;
      }
    }

    function fmtNum(v) {
      return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function renderIndices(items, updatedTs) {
      if (!Array.isArray(items) || items.length === 0) return;

      listEl.innerHTML = items.map(function (item) {
        const hasVal = typeof item.cmp === "number" && Number.isFinite(item.cmp);
        const chg = typeof item.dayChange === "number" ? item.dayChange : 0;
        const chgPct = typeof item.dayChangePct === "number" ? item.dayChangePct : 0;
        const isUp = chg >= 0;
        const color = !hasVal ? "#64748b" : isUp ? "#15803d" : "#b91c1c";
        const bg = !hasVal ? "#f8fafc" : isUp ? "#f0fdf4" : "#fef2f2";
        const border = !hasVal ? "#e2e8f0" : isUp ? "#bbf7d0" : "#fecaca";
        const sign = isUp ? "+" : "";
        const priceTxt = hasVal ? fmtNum(item.cmp) : "--";
        const chgTxt = hasVal ? `${sign}${chg.toFixed(2)} (${sign}${chgPct.toFixed(2)}%)` : "--";
        const a11yText = hasVal
          ? `${item.label}: ${priceTxt}, ${isUp ? "up" : "down"} ${Math.abs(chg).toFixed(2)} points or ${Math.abs(chgPct).toFixed(2)} percent`
          : `${item.label}: loading`;

        return `
          <div role="text" aria-label="${a11yText}" style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 11px; background:${bg}; border:1px solid ${border}; border-radius:8px; font-size:0.86rem; white-space:nowrap; overflow:hidden;">
            <strong style="color:#0f172a; font-weight:800; letter-spacing:0.2px;">${item.label}</strong>
            <span style="display:inline-flex; align-items:center; gap:6px;">
              <span style="font-weight:800; color:#0f172a;">${priceTxt}</span>
              <span style="font-weight:700; color:${color}; font-size:0.8rem;">${chgTxt}</span>
            </span>
          </div>
        `;
      }).join("");

      if (metaEl && updatedTs) {
        try {
          const timeStr = new Date(updatedTs).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit"
          });
          metaEl.textContent = `15-min delayed • Updated ${timeStr} IST`;
        } catch (_) {
          metaEl.textContent = "15-min delayed quotes";
        }
      }
    }

    async function fetchAllIndices() {
      try {
        const results = await Promise.all(
          KEY_INDICES.map(async function (idx) {
            try {
              const res = await fetch(`${PROXY_BASE}?symbol=${encodeURIComponent(idx.symbol)}&exchange=INDEX`);
              if (!res.ok) return { label: idx.label, symbol: idx.symbol };
              const data = await res.json();
              return {
                label: idx.label,
                symbol: idx.symbol,
                cmp: data.cmp,
                dayChange: data.dayChange,
                dayChangePct: data.dayChangePct
              };
            } catch (_) {
              return { label: idx.label, symbol: idx.symbol };
            }
          })
        );

        if (results.some(function (r) { return typeof r.cmp === "number"; })) {
          const now = Date.now();
          renderIndices(results, now);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: now, items: results }));
          } catch (_) {}
        }
      } catch (_) {}
    }

    // 1. Render cached values immediately if available
    let cacheAge = Infinity;
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && Array.isArray(cached.items) && cached.items.length === 3) {
        cacheAge = Date.now() - Number(cached.timestamp || 0);
        renderIndices(cached.items, cached.timestamp);
      }
    } catch (_) {}

    // 2. Fetch fresh 15-min delayed quotes up until automated EOD workflow syncs today (or if no cache exists)
    if (cacheAge >= REFRESH_MS && (shouldUseDelayedIndicesToday() || cacheAge === Infinity)) {
      fetchAllIndices();
    }

    // 3. Auto-refresh every 15 minutes during Indian market hours until EOD sync completes
    setInterval(function () {
      if (isMarketHoursIST() && !isEodSyncedForToday()) {
        fetchAllIndices();
      }
    }, REFRESH_MS);
  })();
});
