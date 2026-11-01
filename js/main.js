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
      "What are the current market trends this week?",
      "How do global cues affect Indian stock markets?",
      "Why are Banking and IT sectors important in Nifty 50?"
    ];
    askResponse.innerHTML = `
      <div class="ai-starter-chips" style="margin-top: 6px;">
        <span style="display:block; font-size: 0.85rem; font-weight: 700; color: #475569; margin-bottom: 8px;">Interactive Market Trend Topics (Click to ask or type your own):</span>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${starters
            .map(
              (s) =>
                `<button type="button" class="quick-ticker-pill home-ai-starter" data-prompt="${s}">${s}</button>`
            )
            .join("")}
        </div>
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
      askResponse.innerHTML = `<p class="ask360-error">Please enter a question for Stocks 360 AI.</p>`;
      return;
    }

    askResponse.innerHTML = `<div class="ask360-ai-card"><p style="color:#2563eb; font-weight:600;">Stocks 360 AI is analyzing market trends...</p></div>`;

    if (typeof StocksGeminiAI !== "undefined") {
      const result = await StocksGeminiAI.askGeneralMarketTrends(q);
      if (result) {
        askInput.value = "";
        StocksGeminiAI.renderAiResponseCard(askResponse, result, function (followUpQ) {
          askInput.value = followUpQ;
          handleTopAsk360();
        });
        return;
      }
    }

    const safeQ = q.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fallbackAnswer =
      "Stock market trends reflect corporate earnings, sectoral performance across Banking and IT, and macroeconomic cues. All explanations on Stocks 360 are for educational purposes only.";
    askResponse.innerHTML = `
      <div class="ask360-ai-card" tabindex="-1">
        <div class="ai-header">
          <span class="ai-pill-badge">Stocks 360 AI Response</span>
        </div>
        <p class="ai-question-echo"><strong>Question:</strong> "${safeQ}"</p>
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
});
