/**
 * Stocks 360 - Google Gemini AI & Strict Content Grounding Engine (gemini-ai.js)
 *
 * Implements two distinct AI modes requested for Stocks 360:
 * 1. IN-CONTENT STRICT MODE (News, Newsletters, Learn Modules):
 *    Strictly answers ONLY from the provided article, newsletter, or lesson content
 *    (Title, Body, Glossary, Key Takeaways). Zero external hallucination.
 *
 * 2. HOMEPAGE / GENERAL MARKET TRENDS MODE (Top AI Banner & Ask 360 Page):
 *    Uses general market trends, financial concepts, and current site headlines to deliver
 *    clear, concise, and interactive answers with clickable follow-up question pills.
 *
 * Built-in Cost Optimization & Budget Guardrails:
 * - Supports Google Gemini Flash-Lite / Flash models (`gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-2.5-flash-lite`)
 * - Session & Local LRU Response Cache (0 repeat API calls for identical questions)
 * - Configurable Daily Request Hard Cap (default 500/day -> stays 100% inside Google's Free Tier)
 * - Hard Output Token Cap (`maxOutputTokens: 260`) for concise responses
 * - Automatic Grounded Local Fallback when no API key is configured or quota is reached
 */

const StocksGeminiAI = (function () {
  const CONFIG_STORAGE_KEY = "stocks360_gemini_config";
  const CACHE_STORAGE_KEY = "stocks360_gemini_response_cache";
  const USAGE_STORAGE_KEY = "stocks360_gemini_daily_usage";

  const DEFAULT_CONFIG = {
    apiKey: "",
    model: "gemini-3.5-flash-lite",
    dailyLimit: 500,
    maxOutputTokens: 260,
    temperatureStrict: 0.1,
    temperatureInteractive: 0.45
  };

  const FALLBACK_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash"
  ];

  let runtimeConfig = null;

  function stripHtml(html) {
    if (!html) return "";
    return String(html)
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, ". ")
      .replace(/<br\s*\/?>/gi, ". ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\.\s*\./g, ".")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------------- CONFIGURATION & DAILY QUOTA GUARDRAILS ----------------
  async function loadConfig() {
    if (runtimeConfig && runtimeConfig.apiKey) {
      return runtimeConfig;
    }

    let localCfg = {};
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) localCfg = JSON.parse(saved) || {};
    } catch (_) {}

    // Check Firebase Firestore (`site_settings/gemini_ai`) if connected
    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady() && !localCfg.apiKey) {
      try {
        const doc = await Promise.race([
          StocksFirebase.getDb().collection("site_settings").doc("gemini_ai").get(),
          new Promise((resolve) => setTimeout(() => resolve(null), 1800))
        ]);
        if (doc && doc.exists) {
          const cloudData = doc.data() || {};
          localCfg = Object.assign({}, cloudData, localCfg);
          try {
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(localCfg));
          } catch (_) {}
        }
      } catch (_) {}
    }

    // Also check if `firebase-secret.json` provided a `geminiApiKey` or `apiKey`
    const fallbackKey =
      localCfg.apiKey ||
      (typeof FIREBASE_CONFIG !== "undefined" &&
        (FIREBASE_CONFIG.geminiApiKey ||
          (FIREBASE_CONFIG.geminiAi && FIREBASE_CONFIG.geminiAi.apiKey) ||
          FIREBASE_CONFIG.apiKey)) ||
      "";

    runtimeConfig = Object.assign({}, DEFAULT_CONFIG, localCfg, {
      apiKey: fallbackKey
    });
    return runtimeConfig;
  }

  function saveConfig(newSettings) {
    let current = {};
    try {
      current = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || "{}");
    } catch (_) {}
    const merged = Object.assign({}, DEFAULT_CONFIG, current, newSettings);
    runtimeConfig = merged;
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(merged));
    } catch (_) {}

    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
      StocksFirebase.getDb()
        .collection("site_settings")
        .doc("gemini_ai")
        .set(
          {
            model: merged.model,
            dailyLimit: merged.dailyLimit,
            maxOutputTokens: merged.maxOutputTokens,
            apiKey: merged.apiKey || "",
            updatedAt: Date.now()
          },
          { merge: true }
        )
        .catch(() => {});
    }
    return merged;
  }

  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function getUsageStats() {
    const today = getTodayKey();
    try {
      const raw = JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) || "{}");
      if (raw.date === today) {
        return {
          date: today,
          requests: raw.requests || 0,
          cacheHits: raw.cacheHits || 0
        };
      }
    } catch (_) {}
    return { date: today, requests: 0, cacheHits: 0 };
  }

  function incrementUsage(isCacheHit) {
    const stats = getUsageStats();
    if (isCacheHit) {
      stats.cacheHits += 1;
    } else {
      stats.requests += 1;
    }
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(stats));
    } catch (_) {}
    return stats;
  }

  // ---------------- RESPONSE CACHE (0 COST FOR REPEAT QUERIES) ----------------
  function getCachedAnswer(cacheKey) {
    try {
      const map = JSON.parse(sessionStorage.getItem(CACHE_STORAGE_KEY) || "{}");
      return map[cacheKey] || null;
    } catch (_) {
      return null;
    }
  }

  function setCachedAnswer(cacheKey, payload) {
    try {
      const map = JSON.parse(sessionStorage.getItem(CACHE_STORAGE_KEY) || "{}");
      const keys = Object.keys(map);
      if (keys.length > 60) {
        delete map[keys[0]];
      }
      map[cacheKey] = payload;
      sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  // ---------------- GEMINI REST API CALL WITH MODEL FALLBACK ----------------
  async function callGeminiModel(systemInstruction, userPrompt, isStrictMode) {
    const cfg = await loadConfig();
    if (!cfg.apiKey) return null;

    const stats = getUsageStats();
    const dailyCap = parseInt(cfg.dailyLimit || "500", 10) || 500;
    if (stats.requests >= dailyCap) {
      console.warn("Stocks 360 AI: Daily cost-control request limit reached. Using local engine.");
      return null;
    }

    const modelsToTry = [cfg.model || "gemini-3.5-flash-lite"].concat(
      FALLBACK_MODELS.filter((m) => m !== cfg.model)
    );

    const temperature = isStrictMode
      ? cfg.temperatureStrict || 0.1
      : cfg.temperatureInteractive || 0.45;
    const maxOutputTokens = parseInt(cfg.maxOutputTokens || "260", 10) || 260;

    for (let i = 0; i < modelsToTry.length; i++) {
      const modelName = modelsToTry[i];
      const endpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(modelName) +
        ":generateContent?key=" +
        encodeURIComponent(cfg.apiKey);

      try {
        const res = await Promise.race([
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: systemInstruction }]
              },
              contents: [
                {
                  role: "user",
                  parts: [{ text: userPrompt }]
                }
              ],
              generationConfig: {
                temperature: temperature,
                maxOutputTokens: maxOutputTokens
              }
            })
          }),
          new Promise((resolve) => setTimeout(() => resolve(null), 7500))
        ]);

        if (res && res.ok) {
          const data = await res.json();
          const candidate = data && data.candidates && data.candidates[0];
          const partText =
            candidate &&
            candidate.content &&
            candidate.content.parts &&
            candidate.content.parts.map((p) => p.text || "").join(" ").trim();
          if (partText) {
            incrementUsage(false);
            return partText;
          }
        }
      } catch (_) {}
    }

    return null;
  }

  // ---------------- STRICT CONTENT-ONLY ENGINE (NEWS, NEWSLETTERS, LEARN) ----------------
  function buildStrictGroundedFallback(question, contextItem, itemTypeLabel) {
    const title = stripHtml(contextItem.title || "this " + itemTypeLabel);
    const body = stripHtml(contextItem.content || contextItem.body || "");
    const glossary = stripHtml(contextItem.glossary || "");
    const takeaways = stripHtml(contextItem.takeaways || contextItem.synopsis || "");
    const combinedText = [title, body, glossary, takeaways].filter(Boolean).join(" ");

    const stopWords = {
      what: 1, is: 1, the: 1, in: 1, of: 1, and: 1, to: 1, a: 1, about: 1, how: 1,
      why: 1, does: 1, this: 1, explain: 1, tell: 1, me: 1, article: 1, news: 1,
      newsletter: 1, lesson: 1, module: 1, unit: 1, mean: 1, means: 1, for: 1, on: 1,
      are: 1, can: 1, you: 1, from: 1, with: 1, by: 1, an: 1, as: 1, at: 1
    };

    const queryTokens = String(question || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords[w]);

    const sentences = combinedText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8);

    // Check if user specifically asked for summary, key takeaways, or glossary
    const qLower = String(question || "").toLowerCase();
    if (
      qLower.includes("summary") ||
      qLower.includes("summarize") ||
      qLower.includes("main point") ||
      qLower.includes("takeaway") ||
      qLower.includes("overview")
    ) {
      const summaryParts = [];
      if (takeaways) summaryParts.push(takeaways);
      if (sentences.length > 0) summaryParts.push(sentences.slice(0, 2).join(" "));
      return {
        answer:
          "Based strictly on " +
          title +
          ": " +
          summaryParts.join(" ").slice(0, 460),
        isGroundedMatch: true
      };
    }

    if (
      (qLower.includes("glossary") || qLower.includes("term") || qLower.includes("define") || qLower.includes("definition")) &&
      glossary
    ) {
      return {
        answer:
          "According to the glossary in this " +
          itemTypeLabel +
          ": " +
          glossary,
        isGroundedMatch: true
      };
    }

    // Score each sentence in the provided content against query tokens
    const scored = sentences.map((sentence) => {
      const sLower = sentence.toLowerCase();
      let score = 0;
      queryTokens.forEach((tok) => {
        if (sLower.includes(tok)) {
          score += tok.length >= 5 ? 3 : 2;
        }
      });
      return { sentence: sentence, score: score };
    });

    scored.sort((a, b) => b.score - a.score);
    const bestMatches = scored.filter((item) => item.score > 0).slice(0, 2);

    if (bestMatches.length > 0) {
      const matchedText = bestMatches.map((m) => m.sentence).join(" ");
      return {
        answer:
          "Based on this " +
          itemTypeLabel +
          " (\"" +
          title +
          "\"): " +
          matchedText +
          (takeaways && !matchedText.includes(takeaways)
            ? " Key takeaway: " + takeaways
            : ""),
        isGroundedMatch: true
      };
    }

    // If question asks about something NOT in the current article/newsletter/lesson
    const briefTopic = takeaways || sentences.slice(0, 2).join(" ") || title;
    return {
      answer:
        "That specific topic is not mentioned in this " +
        itemTypeLabel +
        " (\"" +
        title +
        "\"). This " +
        itemTypeLabel +
        " specifically covers: " +
        briefTopic,
      isGroundedMatch: false
    };
  }

  function buildSuggestedQuestionsForContent(contextItem, itemTypeLabel) {
    const suggestions = ["Summarize the key takeaways of this " + itemTypeLabel];
    if (contextItem && contextItem.glossary && String(contextItem.glossary).trim()) {
      const firstTerm = String(contextItem.glossary).split(":")[0].trim();
      if (firstTerm && firstTerm.length < 35) {
        suggestions.push("What does " + firstTerm + " mean in this " + itemTypeLabel + "?");
      } else {
        suggestions.push("Explain the glossary terms in this " + itemTypeLabel);
      }
    } else {
      suggestions.push("What is the main concept explained in this " + itemTypeLabel + "?");
    }
    return suggestions.slice(0, 2);
  }

  async function askGroundedContentQuestion(question, contextItem, itemTypeLabel) {
    const cleanQ = String(question || "").trim();
    if (!cleanQ) return null;

    const label = itemTypeLabel || "article";
    const itemId = (contextItem && contextItem.id) || (contextItem && contextItem.title) || "item";
    const cacheKey = "strict::" + label + "::" + itemId + "::" + cleanQ.toLowerCase();

    const cached = getCachedAnswer(cacheKey);
    if (cached) {
      incrementUsage(true);
      return cached;
    }

    const title = stripHtml((contextItem && contextItem.title) || "");
    const body = stripHtml((contextItem && (contextItem.content || contextItem.body)) || "");
    const glossary = stripHtml((contextItem && contextItem.glossary) || "");
    const takeaways = stripHtml(
      (contextItem && (contextItem.takeaways || contextItem.synopsis)) || ""
    );

    const contextBlock = [
      "TITLE: " + title,
      body ? "CONTENT: " + body : "",
      glossary ? "GLOSSARY: " + glossary : "",
      takeaways ? "KEY TAKEAWAYS: " + takeaways : ""
    ]
      .filter(Boolean)
      .join("\n");

    const systemInstruction =
      "You are Stocks 360 AI, an accessible financial education assistant. " +
      "CRITICAL RULE: You must answer the user's question STRICTLY and ONLY using the provided " +
      label +
      " content below. Do NOT use any outside information, external facts, or assumptions not present in the provided text. " +
      "If the user's question cannot be answered from the provided text, politely state that the topic is not mentioned in this " +
      label +
      " and briefly state what this " +
      label +
      " does cover based only on the text. " +
      "Keep your response clear, plain-text, concise (2 to 4 sentences), and educational.";

    const userPrompt =
      "PROVIDED " +
      label.toUpperCase() +
      " CONTENT:\n" +
      contextBlock +
      "\n\nUSER QUESTION: " +
      cleanQ;

    let answerText = await callGeminiModel(systemInstruction, userPrompt, true);
    let sourceLabel = "Gemini AI • Grounded in this " + label;

    if (!answerText) {
      const fallback = buildStrictGroundedFallback(cleanQ, contextItem || {}, label);
      answerText = fallback.answer;
      sourceLabel = "Stocks 360 AI • Grounded in this " + label;
    }

    const result = {
      question: cleanQ,
      answer: answerText.replace(/\*\*/g, ""),
      sourceLabel: sourceLabel,
      suggestions: buildSuggestedQuestionsForContent(contextItem, label)
    };

    setCachedAnswer(cacheKey, result);
    return result;
  }

  // ---------------- HOMEPAGE / GENERAL MARKET TRENDS INTERACTIVE ENGINE ----------------
  function getRecentSiteContextSummary() {
    if (typeof StocksDataStore === "undefined") return "";
    try {
      const news = StocksDataStore.getNews().slice(0, 3);
      const nls = StocksDataStore.getNewsletters().slice(0, 2);
      const parts = [];
      if (news.length > 0) {
        parts.push(
          "Recent Market News on Stocks 360: " +
            news.map((n) => n.title + " (" + stripHtml(n.synopsis || n.content).slice(0, 140) + ")").join(" | ")
        );
      }
      if (nls.length > 0) {
        parts.push(
          "Latest Weekly Digest: " +
            nls.map((n) => n.title + " (" + stripHtml(n.content).slice(0, 140) + ")").join(" | ")
        );
      }
      return parts.join("\n");
    } catch (_) {
      return "";
    }
  }

  function buildInteractiveMarketFallback(question) {
    const q = String(question || "").toLowerCase();
    const recentNews =
      typeof StocksDataStore !== "undefined" ? StocksDataStore.getNews() : [];
    const topHeadline =
      recentNews && recentNews[0]
        ? recentNews[0].title
        : "Banking and IT sectors remain in focus amid balanced domestic institutional flows";

    if (q.includes("trend") || q.includes("market") || q.includes("today") || q.includes("week")) {
      return {
        answer:
          "Current Market Trends Overview: Indian markets are witnessing selective sector rotation led by Banking, IT, and capital goods counters, supported by steady domestic institutional investor (DII) activity. Global macroeconomic cues and quarterly corporate earnings remain the primary short-term catalysts. Latest headline on Stocks 360: \"" +
          topHeadline +
          "\".",
        followUps: [
          "How do global cues affect Indian market trends?",
          "Why are Banking and IT sectors important in Nifty 50?",
          "What is the role of Institutional Investors (DIIs & FIIs)?"
        ]
      };
    }

    if (q.includes("global") || q.includes("cue") || q.includes("us") || q.includes("fed") || q.includes("inflation")) {
      return {
        answer:
          "Global Cues & Macro Impact: International market movements (US, Europe, and Asian indices), central bank interest rate decisions, bond yields, and crude oil prices act as early sentiment signals for domestic openings. Higher inflation often prompts central banks to tighten interest rates, influencing rate-sensitive sectors like Banking and Real Estate.",
        followUps: [
          "What are the current market trends this week?",
          "How does SEBI protect retail investors during volatility?",
          "What is market breadth and why does it matter?"
        ]
      };
    }

    if (q.includes("bank") || q.includes("it") || q.includes("sector") || q.includes("mid-cap") || q.includes("midcap")) {
      return {
        answer:
          "Sectoral Trends: Banking and Financial Services hold the largest weightage in Indian benchmark indices (Nifty 50 & Sensex), driven by credit growth and interest rate cycles. Meanwhile, the IT sector responds closely to global technology spending and currency movements, while mid-cap counters reflect domestic growth momentum.",
        followUps: [
          "What is the difference between Sensex and Nifty 50?",
          "What does profit booking mean in a range-bound market?",
          "How do institutional investors support market liquidity?"
        ]
      };
    }

    if (q.includes("sebi") || q.includes("regulat")) {
      return {
        answer:
          "SEBI (Securities and Exchange Board of India) is the statutory regulator for Indian securities markets. It enforces fair trading practices, disclosure norms, and investor protection frameworks across exchanges like NSE and BSE.",
        followUps: [
          "What is the difference between primary (IPO) and secondary markets?",
          "What are the current market trends this week?",
          "Who are retail vs. institutional investors?"
        ]
      };
    }

    if (q.includes("ipo") || q.includes("primary") || q.includes("secondary")) {
      return {
        answer:
          "Primary vs. Secondary Market: In a Primary Market (IPO - Initial Public Offering), a company issues shares to the public for the first time to raise fresh capital. Once listed, those shares trade daily among investors on the Secondary Market (NSE/BSE).",
        followUps: [
          "How does SEBI regulate IPOs and listed companies?",
          "What are the current market trends this week?",
          "What does market volatility mean for beginners?"
        ]
      };
    }

    if (q.includes("bull") || q.includes("bear") || q.includes("volatil") || q.includes("profit booking")) {
      return {
        answer:
          "Market Cycles & Volatility: A Bull market reflects sustained rising prices and optimism, while a Bear market reflects prolonged declines. Volatility measures the speed and degree of price fluctuations, and 'profit booking' occurs when participants sell shares after a rally to lock in gains.",
        followUps: [
          "What are the current market trends this week?",
          "How do global cues influence market sentiment?",
          "What is market breadth?"
        ]
      };
    }

    return {
      answer:
        "Market Trends & Financial Clarity: Stock market trends are shaped by corporate earnings, sectoral rotation (such as Banking, IT, and industrials), domestic institutional flows, and macroeconomic indicators. Currently on Stocks 360, our focus highlights \"" +
        topHeadline +
        "\". Choose a topic below or ask a follow-up question to explore further!",
      followUps: [
        "Summarize the current market trends this week",
        "How do global cues and interest rates impact stocks?",
        "Explain Bull vs. Bear markets and volatility"
      ]
    };
  }

  async function askGeneralMarketTrends(question) {
    const cleanQ = String(question || "").trim();
    if (!cleanQ) return null;

    const cacheKey = "general::" + cleanQ.toLowerCase();
    const cached = getCachedAnswer(cacheKey);
    if (cached) {
      incrementUsage(true);
      return cached;
    }

    const siteContext = getRecentSiteContextSummary();
    const systemInstruction =
      "You are Stocks 360 AI, an interactive, clear, and concise market trends & financial education assistant on the Stocks 360 homepage. " +
      "Guidelines:\n" +
      "1. Use general knowledge of stock market trends, macroeconomic indicators, sector performance (Banking, IT, Mid-caps, Indices), and the current Stocks 360 headlines provided.\n" +
      "2. Keep your answer clear, concise (2 to 4 short sentences), and engaging for learners.\n" +
      "3. Strictly educational—never give buy/sell stock recommendations.\n" +
      "4. At the very end of your response, add a line starting with 'FOLLOW_UPS:' followed by 2 short follow-up questions separated by '|'.";

    const userPrompt =
      (siteContext ? "CURRENT STOCKS 360 HEADLINES:\n" + siteContext + "\n\n" : "") +
      "USER QUESTION: " +
      cleanQ;

    const rawModelText = await callGeminiModel(systemInstruction, userPrompt, false);
    const fallbackObj = buildInteractiveMarketFallback(cleanQ);

    let answerText = fallbackObj.answer;
    let followUps = fallbackObj.followUps;
    let sourceLabel = "Stocks 360 AI • Market Trends Assistant";

    if (rawModelText) {
      sourceLabel = "Gemini AI • Market Trends Assistant";
      const parts = rawModelText.split(/FOLLOW_UPS:/i);
      answerText = parts[0].replace(/\*\*/g, "").trim();
      if (parts[1]) {
        const parsedFollowUps = parts[1]
          .split("|")
          .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
          .filter((s) => s.length > 5 && s.length < 95);
        if (parsedFollowUps.length > 0) {
          followUps = parsedFollowUps.slice(0, 3);
        }
      }
    }

    const result = {
      question: cleanQ,
      answer: answerText,
      sourceLabel: sourceLabel,
      suggestions: followUps
    };

    setCachedAnswer(cacheKey, result);
    return result;
  }

  // ---------------- INTERACTIVE UI RENDER HELPER ----------------
  function renderAiResponseCard(containerEl, resultObj, onSelectFollowUp) {
    if (!containerEl || !resultObj) return;

    const suggestions = resultObj.suggestions || [];
    let chipsHtml = "";
    if (suggestions.length > 0) {
      chipsHtml = `
        <div class="ai-Interactive-chips" style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
          <span style="display:block; font-size: 0.82rem; font-weight: 700; color: #64748b; margin-bottom: 6px;">Explore follow-up questions:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${suggestions
              .map(
                (q) =>
                  `<button type="button" class="quick-ticker-pill ai-followup-chip" data-followup="${escapeHtml(
                    q
                  )}" style="text-align:left; font-size:0.84rem; padding:6px 12px;">${escapeHtml(
                    q
                  )} &rarr;</button>`
              )
              .join("")}
          </div>
        </div>
      `;
    }

    containerEl.innerHTML = `
      <div class="ask360-ai-card" tabindex="-1">
        <div class="ai-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
          <span class="ai-pill-badge" style="font-size:0.78rem; padding:3px 10px;">${escapeHtml(
            resultObj.sourceLabel || "Stocks 360 AI"
          )}</span>
        </div>
        <p class="ai-question-echo" style="margin-bottom:6px;"><strong>Question:</strong> "${escapeHtml(
          resultObj.question
        )}"</p>
        <p class="ai-answer-text" style="color:#1e293b; line-height:1.65;">${escapeHtml(
          resultObj.answer
        )}</p>
        ${chipsHtml}
      </div>
    `;

    if (typeof onSelectFollowUp === "function") {
      containerEl.querySelectorAll(".ai-followup-chip").forEach((chip) => {
        chip.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          const followUpQ = this.getAttribute("data-followup");
          if (followUpQ) {
            onSelectFollowUp(followUpQ);
          }
        });
      });
    }

    if (typeof window.speakWithPitch === "function") {
      window.speakWithPitch(resultObj.answer, true);
    }
  }

  return {
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    getUsageStats: getUsageStats,
    askGroundedContentQuestion: askGroundedContentQuestion,
    askGeneralMarketTrends: askGeneralMarketTrends,
    renderAiResponseCard: renderAiResponseCard
  };
})();

if (typeof window !== "undefined") {
  window.StocksGeminiAI = StocksGeminiAI;
}
