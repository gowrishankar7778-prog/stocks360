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

    const SLOT_MS = 15 * 60 * 1000; // Exact 15-min clock slots (IST = UTC+5:30 = 22 * 15m, so UTC & IST 15m boundaries match)

    function getIstClockParts(nowMs) {
      try {
        const dt = new Date(nowMs || Date.now());
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Kolkata",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          hourCycle: "h23"
        }).formatToParts(dt);
        const getVal = function (type) {
          const p = parts.find(function (x) { return x.type === type; });
          return p ? p.value : "";
        };
        const wd = getVal("weekday");
        const hrRaw = parseInt(getVal("hour"), 10);
        const hr = hrRaw === 24 ? 0 : hrRaw;
        const min = parseInt(getVal("minute"), 10);
        const sec = parseInt(getVal("second"), 10) || 0;
        if (!Number.isFinite(hr) || !Number.isFinite(min)) return null;
        return {
          isWeekend: wd === "Sat" || wd === "Sun",
          totalMins: hr * 60 + min,
          sec: sec
        };
      } catch (_) {
        return null;
      }
    }

    // Returns the active 15-min IST slot start timestamp (09:15, 09:30, 09:45, ..., 15:45 IST),
    // clamping post-15:45 times (before EOD sync) to today's 15:45 IST closing-delay slot.
    function getTargetIndexSlotMs(nowMs) {
      const ts = typeof nowMs === "number" ? nowMs : Date.now();
      const clk = getIstClockParts(ts);
      if (!clk || clk.isWeekend) return null;
      if (clk.totalMins < 555) return null; // Before 09:15 AM IST
      if (isEodSyncedForToday()) return null; // Official EOD dataset already synced for today
      const currentSlot = Math.floor(ts / SLOT_MS) * SLOT_MS;
      if (clk.totalMins <= 945) {
        return currentSlot; // 09:15, 09:30, 09:45 ... 15:45 IST
      }
      // After 15:45 IST (and before EOD sync): clamp to today's 15:45 IST slot
      const minsPast1545 = clk.totalMins - 945;
      const msPast1545 = (minsPast1545 * 60 + clk.sec) * 1000 + (ts % 1000);
      return Math.round((ts - msPast1545) / SLOT_MS) * SLOT_MS;
    }

    function isDelayedAutoRefreshWindowIST() {
      const clk = getIstClockParts(Date.now());
      if (!clk || clk.isWeekend) return false;
      return clk.totalMins >= 555 && clk.totalMins < 945 && !isEodSyncedForToday();
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

    let lastSlotStart = 0;
    let refreshTimerId = null;

    function scheduleNextRefresh() {
      if (refreshTimerId) {
        clearTimeout(refreshTimerId);
        refreshTimerId = null;
      }
      const now = Date.now();
      const clk = getIstClockParts(now);
      if (!clk || clk.isWeekend || isEodSyncedForToday()) return;

      // Before 09:15 AM IST on a weekday: schedule wakeup right at 09:15:02 AM IST
      if (clk.totalMins < 555) {
        const secsUntil0915 = (555 - clk.totalMins) * 60 - clk.sec;
        const delayToOpen = Math.max(2000, secsUntil0915 * 1000 + 2000);
        refreshTimerId = setTimeout(function () {
          fetchAllIndices();
        }, delayToOpen);
        return;
      }

      // Stop scheduling new timers once the 15:45 IST closing-delay slot has been fetched
      if (clk.totalMins >= 945 && lastSlotStart >= (getTargetIndexSlotMs(now) || 0)) {
        return;
      }

      // Schedule for exact next quarter-hour boundary (:00, :15, :30, :45 IST) + 2s buffer
      const nextBoundaryMs = (Math.floor(now / SLOT_MS) + 1) * SLOT_MS;
      const delay = Math.max(2000, nextBoundaryMs - now + 2000);
      refreshTimerId = setTimeout(async function () {
        if (shouldUseDelayedIndicesToday()) {
          await fetchAllIndices();
        } else {
          scheduleNextRefresh();
        }
      }, delay);
    }

    async function fetchAllIndices() {
      const now = Date.now();
      const targetSlot = getTargetIndexSlotMs(now);
      const slotParam = targetSlot ? `&slot=${targetSlot}` : "";
      try {
        const results = await Promise.all(
          KEY_INDICES.map(async function (idx) {
            try {
              const res = await fetch(
                `${PROXY_BASE}?symbol=${encodeURIComponent(idx.symbol)}&exchange=INDEX${slotParam}`,
                { cache: "no-store" }
              );
              if (!res.ok) return { label: idx.label, symbol: idx.symbol };
              const data = await res.json();
              return {
                label: idx.label,
                symbol: idx.symbol,
                cmp: data.cmp,
                dayChange: data.dayChange,
                dayChangePct: data.dayChangePct,
                timestamp: data.timestamp
              };
            } catch (_) {
              return { label: idx.label, symbol: idx.symbol };
            }
          })
        );

        if (results.some(function (r) { return typeof r.cmp === "number"; })) {
          const displayTs = targetSlot || results.reduce(function (acc, r) {
            return typeof r.timestamp === "number" && r.timestamp > acc ? r.timestamp : acc;
          }, 0) || Date.now();
          if (targetSlot) {
            lastSlotStart = targetSlot;
          }
          renderIndices(results, displayTs);
          try {
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({
                slotStart: targetSlot || 0,
                timestamp: displayTs,
                items: results
              })
            );
          } catch (_) {}
        }
      } catch (_) {}
      scheduleNextRefresh();
    }

    // 1. Render cached values immediately if available
    let hasCachedItems = false;
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && Array.isArray(cached.items) && cached.items.length === 3) {
        hasCachedItems = true;
        lastSlotStart = Number(cached.slotStart || 0);
        renderIndices(cached.items, cached.slotStart || cached.timestamp);
      }
    } catch (_) {}

    // 2. Fetch if current 15-min IST slot (09:15, 09:30, 09:45...) hasn't been fetched yet, or if no cache exists
    const initialTargetSlot = getTargetIndexSlotMs(Date.now());
    if ((initialTargetSlot && lastSlotStart !== initialTargetSlot) || !hasCachedItems) {
      fetchAllIndices();
    } else {
      scheduleNextRefresh();
    }

    // 3. Catch up immediately if tab wakes up in a newer 15-minute IST slot
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      const currentTargetSlot = getTargetIndexSlotMs(Date.now());
      if (currentTargetSlot && lastSlotStart !== currentTargetSlot) {
        fetchAllIndices();
      } else {
        scheduleNextRefresh();
      }
    });
  })();

  // Homepage Precious Metals Strip (Gold 10g & Silver 1kg Global Spot INR Equiv., 15-min delayed)
  (function initHomeMetalsStrip() {
    const stripEl = document.getElementById("home-metals-strip");
    const listEl = document.getElementById("home-metals-list");
    const detailEl = document.getElementById("home-metals-detail");
    const metaEl = document.getElementById("home-metals-meta");
    if (!stripEl || !listEl || !detailEl) return;

    const CACHE_KEY = "stocks360_home_metals_cache_v1";
    const SLOT_MS = 15 * 60 * 1000;
    const TROY_OUNCE_GRAMS = 31.1034768;
    const PROXY_BASE = "https://stocks360-quotes.stocks360-app.workers.dev/quote";

    let metalsState = { gold: null, silver: null, usdinr: null, updatedTs: 0 };
    let activeMetalKey = null;
    let lastSlotStart = 0;
    let refreshTimerId = null;

    function getIstClock(nowMs) {
      try {
        const dt = new Date(nowMs || Date.now());
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Kolkata",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          hourCycle: "h23"
        }).formatToParts(dt);
        const getVal = function (type) {
          const p = parts.find(function (x) { return x.type === type; });
          return p ? p.value : "";
        };
        const wd = getVal("weekday");
        const hrRaw = parseInt(getVal("hour"), 10);
        const hr = hrRaw === 24 ? 0 : hrRaw;
        const min = parseInt(getVal("minute"), 10);
        const sec = parseInt(getVal("second"), 10) || 0;
        if (!Number.isFinite(hr) || !Number.isFinite(min)) return null;
        return { isWeekend: wd === "Sat" || wd === "Sun", totalMins: hr * 60 + min, sec: sec };
      } catch (_) {
        return null;
      }
    }

    // MCX Gold/Silver hours: 09:00 AM to 11:55 PM IST (Mon-Fri)
    function getTargetMetalSlotMs(nowMs) {
      const ts = typeof nowMs === "number" ? nowMs : Date.now();
      const clk = getIstClock(ts);
      if (!clk || clk.isWeekend) return null;
      if (clk.totalMins < 540 || clk.totalMins > 1435) return null; // Outside 09:00 - 23:55 IST
      return Math.floor(ts / SLOT_MS) * SLOT_MS;
    }

    function fmtInr(v, decimals) {
      if (typeof v !== "number" || !Number.isFinite(v)) return "--";
      return "₹ " + v.toLocaleString("en-IN", {
        minimumFractionDigits: typeof decimals === "number" ? decimals : 0,
        maximumFractionDigits: typeof decimals === "number" ? decimals : 0
      });
    }

    function fmtUsd(v) {
      if (typeof v !== "number" || !Number.isFinite(v)) return "--";
      return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function convertMetalQuote(raw, usdinr, gramsUnit, label, subLabel) {
      if (!raw || typeof raw.cmp !== "number" || typeof usdinr !== "number") return null;
      const factor = (usdinr / TROY_OUNCE_GRAMS) * gramsUnit;
      const conv = function (val) {
        return typeof val === "number" && Number.isFinite(val) ? Math.round(val * factor) : null;
      };
      const cmpInr = conv(raw.cmp);
      const prevInr = conv(raw.prevClose);
      const chgInr = cmpInr !== null && prevInr !== null ? cmpInr - prevInr : 0;
      const chgPct = typeof raw.dayChangePct === "number" ? raw.dayChangePct : (prevInr ? (chgInr / prevInr) * 100 : 0);
      return {
        label: label,
        subLabel: subLabel,
        cmpInr: cmpInr,
        dayOpenInr: conv(raw.dayOpen),
        dayHighInr: conv(raw.dayHigh),
        dayLowInr: conv(raw.dayLow),
        prevCloseInr: prevInr,
        high52Inr: conv(raw.high52),
        low52Inr: conv(raw.low52),
        cmpUsd: raw.cmp,
        high52Usd: raw.high52,
        low52Usd: raw.low52,
        dayChangeInr: chgInr,
        dayChangePct: Number(chgPct.toFixed(2))
      };
    }

    function collapseMetalDetail(restoreFocus) {
      if (!activeMetalKey) return;
      const prevBtn = document.getElementById(activeMetalKey === "gold" ? "metal-btn-gold" : "metal-btn-silver");
      activeMetalKey = null;
      detailEl.hidden = true;
      detailEl.innerHTML = "";
      listEl.querySelectorAll("button[data-metal]").forEach(function (btn) {
        btn.setAttribute("aria-expanded", "false");
        btn.style.boxShadow = "none";
      });
      if (restoreFocus && prevBtn && typeof prevBtn.focus === "function") {
        prevBtn.focus();
      }
    }

    function renderMetalDetail(key) {
      const m = metalsState[key];
      if (!m) {
        detailEl.hidden = false;
        detailEl.innerHTML = `<p style="margin:0; font-size:0.85rem; color:#64748b;">Loading ${key === "gold" ? "Gold" : "Silver"} quote details...</p>`;
        return;
      }
      const isUp = m.dayChangePct >= 0;
      const pillBg = isUp ? "#f0fdf4" : "#fef2f2";
      const pillColor = isUp ? "#15803d" : "#b91c1c";
      const pillBorder = isUp ? "#bbf7d0" : "#fecaca";
      const sign = isUp ? "+" : "-";
      const cards = [
        { label: "Today's Open", val: fmtInr(m.dayOpenInr) },
        { label: "Today's High", val: fmtInr(m.dayHighInr), color: "#15803d" },
        { label: "Today's Low", val: fmtInr(m.dayLowInr), color: "#b91c1c" },
        { label: "Previous Close", val: fmtInr(m.prevCloseInr) },
        { label: "52-Week High", val: fmtInr(m.high52Inr), sub: m.high52Usd ? `${fmtUsd(m.high52Usd)}/oz` : "", color: "#15803d" },
        { label: "52-Week Low", val: fmtInr(m.low52Inr), sub: m.low52Usd ? `${fmtUsd(m.low52Usd)}/oz` : "", color: "#b91c1c" }
      ];

      detailEl.hidden = false;
      detailEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong style="font-size:0.96rem; color:#0f172a;">${m.subLabel}</strong>
              <span style="font-size:0.82rem; font-weight:700; padding:2px 8px; border-radius:999px; background:${pillBg}; color:${pillColor}; border:1px solid ${pillBorder};">
                ${sign}${fmtInr(Math.abs(m.dayChangeInr)).replace("₹ ", "₹")} (${isUp ? "+" : ""}${m.dayChangePct.toFixed(2)}%)
              </span>
            </div>
            <div style="font-size:0.75rem; color:#64748b; margin-top:3px;">
              Spot: ${fmtUsd(m.cmpUsd)}/oz &bull; USD/INR: ₹${Number(metalsState.usdinr || 0).toFixed(2)} &bull; Excludes customs duty &amp; GST
            </div>
          </div>
          <button type="button" id="home-metals-close-btn" aria-label="Close metal details" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:3px 9px; font-size:0.78rem; font-weight:700; color:#475569; cursor:pointer;">Close &times;</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px;">
          ${cards.map(function (c) {
            return `
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px;">
                <div style="font-size:0.72rem; color:#64748b; font-weight:600;">${c.label}</div>
                <div style="font-size:0.9rem; font-weight:800; color:${c.color || "#0f172a"}; margin-top:2px;">${c.val}</div>
                ${c.sub ? `<div style="font-size:0.69rem; color:#94a3b8;">${c.sub}</div>` : ""}
              </div>
            `;
          }).join("")}
        </div>
      `;

      const closeBtn = document.getElementById("home-metals-close-btn");
      if (closeBtn) {
        closeBtn.addEventListener("click", function () {
          collapseMetalDetail(true);
        });
      }
    }

    function renderMetalButtons() {
      [
        { key: "gold", btnId: "metal-btn-gold", title: "Gold (10g)", baseBg: "#fffbeb", baseBorder: "#fde68a", titleColor: "#92400e" },
        { key: "silver", btnId: "metal-btn-silver", title: "Silver (1kg)", baseBg: "#f8fafc", baseBorder: "#e2e8f0", titleColor: "#334155" }
      ].forEach(function (cfg) {
        const btn = document.getElementById(cfg.btnId);
        if (!btn) return;
        const m = metalsState[cfg.key];
        if (!m) {
          btn.innerHTML = `<strong style="color:${cfg.titleColor}; font-weight:800;">${cfg.title}</strong><span style="color:#64748b; font-size:0.82rem;">--</span>`;
          return;
        }
        const isUp = m.dayChangePct >= 0;
        const chgColor = isUp ? "#15803d" : "#b91c1c";
        const sign = isUp ? "+" : "";
        const isOpen = activeMetalKey === cfg.key;
        btn.style.background = isUp && cfg.key === "silver" ? "#f0fdf4" : (!isUp && cfg.key === "silver" ? "#fef2f2" : cfg.baseBg);
        btn.style.borderColor = isOpen ? "#2563eb" : cfg.baseBorder;
        btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        btn.setAttribute("aria-label", `${cfg.title}: ${fmtInr(m.cmpInr)}, ${sign}${m.dayChangePct.toFixed(2)} percent. Click for high, low, and 52-week range.`);
        btn.innerHTML = `
          <strong style="color:${cfg.titleColor}; font-weight:800;">${cfg.title}</strong>
          <span style="display:inline-flex; align-items:center; gap:6px;">
            <span style="font-weight:800; color:#0f172a;">${fmtInr(m.cmpInr)}</span>
            <span style="font-weight:700; color:${chgColor}; font-size:0.8rem;">(${sign}${m.dayChangePct.toFixed(2)}%)</span>
            <span aria-hidden="true" style="font-size:0.7rem; color:#64748b;">${isOpen ? "&#9650;" : "&#9660;"}</span>
          </span>
        `;
      });

      if (metaEl && metalsState.updatedTs) {
        try {
          const tStr = new Date(metalsState.updatedTs).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit"
          });
          metaEl.textContent = `15-min delayed • Updated ${tStr} IST • Click for details`;
        } catch (_) {}
      }

      if (activeMetalKey) {
        renderMetalDetail(activeMetalKey);
      }
    }

    function scheduleNextMetalRefresh() {
      if (refreshTimerId) {
        clearTimeout(refreshTimerId);
        refreshTimerId = null;
      }
      const now = Date.now();
      const clk = getIstClock(now);
      if (!clk || clk.isWeekend || clk.totalMins > 1435) return;
      if (clk.totalMins < 540) {
        const secsTo0900 = (540 - clk.totalMins) * 60 - clk.sec;
        refreshTimerId = setTimeout(fetchMetals, Math.max(2000, secsTo0900 * 1000 + 2000));
        return;
      }
      const nextBoundaryMs = (Math.floor(now / SLOT_MS) + 1) * SLOT_MS;
      refreshTimerId = setTimeout(fetchMetals, Math.max(2000, nextBoundaryMs - now + 2000));
    }

    async function fetchMetals() {
      const now = Date.now();
      const targetSlot = getTargetMetalSlotMs(now);
      const slotParam = targetSlot ? `&slot=${targetSlot}` : "";
      try {
        const [goldRes, silverRes, fxRes] = await Promise.all([
          fetch(`${PROXY_BASE}?symbol=GC%3DF&exchange=COMMODITY${slotParam}`, { cache: "no-store" }),
          fetch(`${PROXY_BASE}?symbol=SI%3DF&exchange=COMMODITY${slotParam}`, { cache: "no-store" }),
          fetch(`${PROXY_BASE}?symbol=USDINR%3DX&exchange=FX${slotParam}`, { cache: "no-store" })
        ]);
        const [goldRaw, silverRaw, fxRaw] = await Promise.all([
          goldRes.ok ? goldRes.json() : null,
          silverRes.ok ? silverRes.json() : null,
          fxRes.ok ? fxRes.json() : null
        ]);
        const usdinr = fxRaw && typeof fxRaw.cmp === "number" ? fxRaw.cmp : null;
        if (usdinr && (goldRaw || silverRaw)) {
          const displayTs = targetSlot || now;
          metalsState = {
            gold: convertMetalQuote(goldRaw, usdinr, 10, "Gold (10g)", "Gold 24K (Global Spot • per 10g)"),
            silver: convertMetalQuote(silverRaw, usdinr, 1000, "Silver (1kg)", "Silver (Global Spot • per 1kg)"),
            usdinr: usdinr,
            updatedTs: displayTs
          };
          if (targetSlot) lastSlotStart = targetSlot;
          renderMetalButtons();
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ slotStart: targetSlot || 0, state: metalsState }));
          } catch (_) {}
        }
      } catch (_) {}
      scheduleNextMetalRefresh();
    }

    listEl.addEventListener("click", function (e) {
      const btn = e.target.closest("button[data-metal]");
      if (!btn) return;
      const key = btn.getAttribute("data-metal");
      if (!key) return;
      if (activeMetalKey === key) {
        collapseMetalDetail(false);
        renderMetalButtons();
      } else {
        activeMetalKey = key;
        renderMetalButtons();
      }
    });

    // Collapse when clicking/tapping outside the metals strip
    document.addEventListener("click", function (e) {
      if (activeMetalKey && !stripEl.contains(e.target)) {
        collapseMetalDetail(false);
        renderMetalButtons();
      }
    });

    // Collapse when keyboard focus leaves the metals strip
    stripEl.addEventListener("focusout", function (e) {
      if (!activeMetalKey) return;
      if (e.relatedTarget && !stripEl.contains(e.relatedTarget)) {
        collapseMetalDetail(false);
        renderMetalButtons();
      }
    });

    // Collapse on Escape key
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.key === "Esc") && activeMetalKey) {
        collapseMetalDetail(true);
        renderMetalButtons();
      }
    });

    // Load cached metals immediately
    let hasCache = false;
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && cached.state && (cached.state.gold || cached.state.silver)) {
        hasCache = true;
        lastSlotStart = Number(cached.slotStart || 0);
        metalsState = cached.state;
        renderMetalButtons();
      }
    } catch (_) {}

    const initialSlot = getTargetMetalSlotMs(Date.now());
    if ((initialSlot && lastSlotStart !== initialSlot) || !hasCache) {
      fetchMetals();
    } else {
      scheduleNextMetalRefresh();
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      const currentSlot = getTargetMetalSlotMs(Date.now());
      if (currentSlot && lastSlotStart !== currentSlot) {
        fetchMetals();
      } else {
        scheduleNextMetalRefresh();
      }
    });
  })();
});
