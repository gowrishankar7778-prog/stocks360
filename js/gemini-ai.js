/**
 * Stocks 360 - Natural Conversational Gemini AI & Grounded Content Engine (gemini-ai.js)
 *
 * Implements two natural, conversational AI modes for Stocks 360:
 * 1. IN-CONTENT STRICT MODE (News, Newsletters, Learn Modules):
 *    Answers naturally like a helpful mentor, strictly using ONLY the open article,
 *    newsletter, or lesson content (Title, Body, Glossary, Key Takeaways).
 *
 * 2. HOMEPAGE / GENERAL MARKET TRENDS MODE (Top AI Banner & Ask 360 Page):
 *    Converses naturally about market trends, sector movements, financial concepts,
 *    and current site headlines with multi-turn memory and smooth follow-up flow.
 *
 * Built-in Cost Optimization & Budget Guardrails:
 * - Supports Google Gemini Flash-Lite / Flash models (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-lite`)
 * - Session & Local LRU Response Cache (0 repeat API calls for identical questions)
 * - Configurable Daily Request Hard Cap (default 500/day -> stays 100% inside Google's Free Tier)
 * - Hard Output Token Cap (`maxOutputTokens: 280`) for concise, natural responses
 */

const StocksGeminiAI = (function () {
  const CONFIG_STORAGE_KEY = "stocks360_gemini_config";
  const CACHE_STORAGE_KEY = "stocks360_gemini_response_cache_v2";
  const USAGE_STORAGE_KEY = "stocks360_gemini_daily_usage";

  const DEFAULT_CONFIG = {
    apiKey: "",
    model: "gemini-3.8-flash",
    dailyLimit: 500,
    maxOutputTokens: 280,
    temperatureStrict: 0.2,
    temperatureInteractive: 0.55
  };

  const FALLBACK_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash"
  ];

  let runtimeConfig = null;
  // Stores multi-turn conversation threads keyed by container ID or context key
  const conversationThreads = {};

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

  function cleanNaturalText(text) {
    if (!text) return "";
    return String(text)
      .replace(/\*\*/g, "")
      .replace(/^(Current Market Trends Overview|Market Trends & Financial Clarity|Sectoral Trends|Global Cues & Macro Impact|Market Cycles & Volatility|Primary vs\. Secondary Market):\s*/i, "")
      .replace(/FOLLOW_UPS:[\s\S]*$/i, "")
      .trim();
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
      (typeof FIREBASE_CONFIG !== "undefined" &&
        (FIREBASE_CONFIG.geminiApiKey ||
          (FIREBASE_CONFIG.geminiAi && FIREBASE_CONFIG.geminiAi.apiKey) ||
          FIREBASE_CONFIG.apiKey)) ||
      localCfg.apiKey ||
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

  function getThreadHistory(threadKey) {
    if (!conversationThreads[threadKey]) {
      conversationThreads[threadKey] = [];
    }
    return conversationThreads[threadKey];
  }

  function pushToThread(threadKey, question, answer, suggestions) {
    const list = getThreadHistory(threadKey);
    list.push({
      question: question,
      answer: answer,
      suggestions: suggestions || [],
      timestamp: Date.now()
    });
    if (list.length > 8) {
      list.shift();
    }
    return list;
  }

  // ---------------- GEMINI REST API CALL WITH MULTI-TURN MEMORY ----------------
  async function callGeminiModel(systemInstruction, userPrompt, isStrictMode, priorTurns) {
    const cfg = await loadConfig();
    if (!cfg.apiKey) return null;

    const stats = getUsageStats();
    const dailyCap = parseInt(cfg.dailyLimit || "500", 10) || 500;
    if (stats.requests >= dailyCap) {
      return null;
    }

    const modelsToTry = [cfg.model || "gemini-3.8-flash"].concat(
      FALLBACK_MODELS.filter((m) => m !== cfg.model)
    );

    const temperature = isStrictMode
      ? cfg.temperatureStrict || 0.2
      : cfg.temperatureInteractive || 0.55;
    const maxOutputTokens = parseInt(cfg.maxOutputTokens || "280", 10) || 280;

    const contents = [];
    if (Array.isArray(priorTurns) && priorTurns.length > 0) {
      priorTurns.slice(-3).forEach((turn) => {
        if (turn.question && turn.answer) {
          contents.push({ role: "user", parts: [{ text: turn.question }] });
          contents.push({ role: "model", parts: [{ text: turn.answer }] });
        }
      });
    }
    contents.push({ role: "user", parts: [{ text: userPrompt }] });

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
              contents: contents,
              generationConfig: {
                temperature: temperature,
                maxOutputTokens: maxOutputTokens
              }
            })
          }),
          new Promise((resolve) => setTimeout(() => resolve(null), 6500))
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
  function buildStrictGroundedFallback(question, contextItem, itemTypeLabel, priorTurns) {
    const title = stripHtml(contextItem.title || "this " + itemTypeLabel);
    const body = stripHtml(contextItem.content || contextItem.body || "");
    const glossary = stripHtml(contextItem.glossary || "");
    const takeaways = stripHtml(contextItem.takeaways || contextItem.synopsis || "");
    const combinedText = [body, takeaways, glossary].filter(Boolean).join(" ");

    const qLower = String(question || "").toLowerCase().trim();

    // Natural greeting handling inside an article/newsletter/lesson
    if (/^(hi|hello|hey|good morning|good evening|namaste)\b/i.test(qLower) && qLower.length < 25) {
      const introSummary = takeaways || body.split(/(?<=[.!?])\s+/)[0] || title;
      return {
        answer:
          "Hi there! We're looking at \"" +
          title +
          "\". In short, " +
          introSummary.charAt(0).toLowerCase() +
          introSummary.slice(1) +
          " What part of this " +
          itemTypeLabel +
          " would you like me to break down?",
        isGroundedMatch: true
      };
    }

    // Conversational follow-up ("tell me more", "explain simply", "why", "what else")
    const sentences = combinedText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    if (
      /^(tell me more|more details|explain more|what else|go on|elaborate|explain simply|in simple terms)/i.test(
        qLower
      )
    ) {
      const moreText = sentences.slice(1, 4).join(" ") || sentences.join(" ") || takeaways;
      return {
        answer:
          "Looking closer at what's covered here: " +
          moreText +
          (glossary ? " Also, a helpful term mentioned here is — " + glossary : ""),
        isGroundedMatch: true
      };
    }

    if (
      qLower.includes("summary") ||
      qLower.includes("summarize") ||
      qLower.includes("main point") ||
      qLower.includes("takeaway") ||
      qLower.includes("overview") ||
      qLower.includes("what is this about")
    ) {
      const summaryParts = [];
      if (takeaways) summaryParts.push(takeaways);
      if (sentences.length > 0 && (!takeaways || !sentences[0].includes(takeaways.slice(0, 20)))) {
        summaryParts.push(sentences.slice(0, 2).join(" "));
      }
      return {
        answer:
          "Here's the core takeaway from this " +
          itemTypeLabel +
          ": " +
          summaryParts.join(" ").slice(0, 480),
        isGroundedMatch: true
      };
    }

    if (
      (qLower.includes("glossary") ||
        qLower.includes("term") ||
        qLower.includes("define") ||
        qLower.includes("definition") ||
        qLower.includes("meaning")) &&
      glossary
    ) {
      return {
        answer: "Here's how this " + itemTypeLabel + " explains that term: " + glossary,
        isGroundedMatch: true
      };
    }

    const stopWords = {
      what: 1, is: 1, the: 1, in: 1, of: 1, and: 1, to: 1, a: 1, about: 1, how: 1,
      why: 1, does: 1, this: 1, explain: 1, tell: 1, me: 1, article: 1, news: 1,
      newsletter: 1, lesson: 1, module: 1, unit: 1, mean: 1, means: 1, for: 1, on: 1,
      are: 1, can: 1, you: 1, from: 1, with: 1, by: 1, an: 1, as: 1, at: 1
    };

    const queryTokens = qLower
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords[w]);

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
          matchedText +
          (takeaways && !matchedText.includes(takeaways.slice(0, 25))
            ? " The main takeaway to keep in mind is: " + takeaways
            : ""),
        isGroundedMatch: true
      };
    }

    const briefTopic = takeaways || sentences.slice(0, 2).join(" ") || title;
    return {
      answer:
        "This " +
        itemTypeLabel +
        " doesn't mention that directly—it focuses on \"" +
        title +
        "\", specifically how " +
        briefTopic.charAt(0).toLowerCase() +
        briefTopic.slice(1),
      isGroundedMatch: false
    };
  }

  function buildSuggestedQuestionsForContent(contextItem, itemTypeLabel, lastQuestion) {
    const candidates = [
      "What is the main takeaway here?",
      "Explain this in simple terms"
    ];
    if (contextItem && contextItem.glossary && String(contextItem.glossary).trim()) {
      const firstTerm = String(contextItem.glossary).split(":")[0].trim();
      if (firstTerm && firstTerm.length < 35) {
        candidates.unshift("What does " + firstTerm + " mean here?");
      }
    }
    const lastLower = String(lastQuestion || "").toLowerCase();
    return candidates
      .filter((c) => c.toLowerCase() !== lastLower)
      .slice(0, 2);
  }

  async function askGroundedContentQuestion(question, contextItem, itemTypeLabel) {
    const cleanQ = String(question || "").trim();
    if (!cleanQ) return null;

    const label = itemTypeLabel || "article";
    const itemId = (contextItem && contextItem.id) || (contextItem && contextItem.title) || "item";
    const threadKey = "strict::" + label + "::" + itemId;
    const priorTurns = getThreadHistory(threadKey);

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
      "You are Stocks 360 AI, a warm, natural, conversational financial education assistant. " +
      "CRITICAL RULE: Answer the user's question STRICTLY and ONLY using the provided " +
      label +
      " content below. Do NOT bring in outside facts or assumptions not in the text. " +
      "Speak naturally like a helpful human tutor—never use robotic headers, bullet labels, or stiff prefixes like 'Based strictly on the provided text:'. " +
      "If the user asks about something not covered in this " +
      label +
      ", naturally mention that this " +
      label +
      " doesn't cover that topic and briefly share what it does focus on. " +
      "Keep your reply conversational, warm, and concise (2 to 4 sentences).";

    const userPrompt =
      "PROVIDED " +
      label.toUpperCase() +
      " CONTENT:\n" +
      contextBlock +
      "\n\nUSER MESSAGE: " +
      cleanQ;

    let answerText = await callGeminiModel(systemInstruction, userPrompt, true, priorTurns);

    if (!answerText) {
      const fallback = buildStrictGroundedFallback(cleanQ, contextItem || {}, label, priorTurns);
      answerText = fallback.answer;
    }

    const cleanedAnswer = cleanNaturalText(answerText);
    const suggestions = buildSuggestedQuestionsForContent(contextItem, label, cleanQ);
    const history = pushToThread(threadKey, cleanQ, cleanedAnswer, suggestions);

    return {
      threadKey: threadKey,
      question: cleanQ,
      answer: cleanedAnswer,
      suggestions: suggestions,
      history: history
    };
  }

  // ---------------- HOMEPAGE / GENERAL MARKET TRENDS CONVERSATIONAL ENGINE ----------------
  function getRecentSiteContextSummary() {
    if (typeof StocksDataStore === "undefined") return "";
    try {
      const news = StocksDataStore.getNews().slice(0, 3);
      const nls = StocksDataStore.getNewsletters().slice(0, 2);
      const parts = [];
      if (news.length > 0) {
        parts.push(
          "Current Headlines on Stocks 360: " +
            news.map((n) => n.title + " (" + stripHtml(n.synopsis || n.content).slice(0, 140) + ")").join(" | ")
        );
      }
      if (nls.length > 0) {
        parts.push(
          "Weekly Digest: " +
            nls.map((n) => n.title + " (" + stripHtml(n.content).slice(0, 140) + ")").join(" | ")
        );
      }
      return parts.join("\n");
    } catch (_) {
      return "";
    }
  }

  function buildNaturalMarketFallback(question, priorTurns) {
    const q = String(question || "").toLowerCase().trim();
    const recentNews =
      typeof StocksDataStore !== "undefined" ? StocksDataStore.getNews() : [];
    const topHeadline =
      recentNews && recentNews[0]
        ? recentNews[0].title
        : "steady institutional activity across Banking and IT counters";

    // 1. Casual greetings & small talk
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|namaste|how are you)/i.test(q) && q.length < 30) {
      return {
        answer:
          "Hi! Great to have you here on Stocks 360. Right now we're tracking how Indian indices are moving alongside Banking and IT heavyweights—especially with stories like \"" +
          topHeadline +
          "\". What market trend or stock concept would you like to chat about?",
        followUps: [
          "How is the market moving this week?",
          "Why do Banking and IT drive Nifty 50?"
        ]
      };
    }

    if (/^(thanks|thank you|got it|understood|ok|okay|nice|cool|great)\b/i.test(q) && q.length < 25) {
      return {
        answer:
          "You're very welcome! Feel free to ask anytime if you want to unpack another market trend, index movement, or trading concept.",
        followUps: [
          "How do global cues affect Indian markets?",
          "What does market volatility mean for beginners?"
        ]
      };
    }

    // 2. Conversational follow-ups ("why?", "tell me more", "give an example", "how does that work?")
    const lastTurn = priorTurns && priorTurns.length > 0 ? priorTurns[priorTurns.length - 1] : null;
    if (
      lastTurn &&
      /^(why|how does that work|tell me more|explain more|give an example|for example|what about|and what|in simple terms)/i.test(
        q
      )
    ) {
      return {
        answer:
          "Think of it this way: in the stock market, prices move whenever expectations around company earnings, interest rates, or institutional money flows shift. For example, when domestic mutual funds (DIIs) steadily invest every month through SIPs, it creates a strong cushion even when global markets are choppy.",
        followUps: [
          "Who are DIIs and FIIs in the stock market?",
          "How do interest rates affect stock prices?"
        ]
      };
    }

    // 3. Market trends / this week / today
    if (q.includes("trend") || q.includes("moving") || q.includes("today") || q.includes("week") || q.includes("market")) {
      return {
        answer:
          "Right now, Indian markets are seeing selective sector action led by Banking, IT, and capital goods, backed by steady buying from domestic institutional investors. One of the key stories we're following on Stocks 360 is \"" +
          topHeadline +
          "\", as traders watch quarterly earnings and global interest rate cues.",
        followUps: [
          "How do global cues affect our markets?",
          "Why are Banking and IT so influential?"
        ]
      };
    }

    // 4. Global cues, inflation, interest rates, US Fed
    if (q.includes("global") || q.includes("cue") || q.includes("us") || q.includes("fed") || q.includes("inflation") || q.includes("interest rate")) {
      return {
        answer:
          "Global cues—like US and Asian market movements, crude oil prices, and central bank interest rate decisions—set the early mood before Indian markets open at 9:15 AM. When inflation cools and interest rates stabilize, borrowing costs ease up, which usually gives a boost to sectors like Banking, Auto, and Real Estate.",
        followUps: [
          "Why are Banking and IT so influential?",
          "What does profit booking mean after a rally?"
        ]
      };
    }

    // 5. Banking, IT, sectors, Nifty, Sensex
    if (q.includes("bank") || q.includes("it") || q.includes("sector") || q.includes("nifty") || q.includes("sensex") || q.includes("index")) {
      return {
        answer:
          "Nifty 50 and Sensex act like a barometer for the overall economy by tracking India's largest listed companies. Banking and Financial Services carry the biggest weight in those indices, while IT companies react closely to global tech spending and the Rupee-Dollar exchange rate.",
        followUps: [
          "What is the difference between Sensex and Nifty 50?",
          "How do DIIs and FIIs influence market direction?"
        ]
      };
    }

    // 6. DIIs, FIIs, institutional investors, liquidity
    if (q.includes("dii") || q.includes("fii") || q.includes("institution") || q.includes("retail") || q.includes("liquidity")) {
      return {
        answer:
          "Institutional investors are large organizations like mutual funds, insurance companies (DIIs in India), and foreign funds (FIIs). Because they trade in large volumes, their buying and selling drives a lot of the daily momentum, while steady domestic SIP inflows have helped keep Indian markets resilient.",
        followUps: [
          "How is the market moving this week?",
          "How does SEBI protect everyday investors?"
        ]
      };
    }

    // 7. SEBI & regulation
    if (q.includes("sebi") || q.includes("regulat")) {
      return {
        answer:
          "SEBI (Securities and Exchange Board of India) is the market watchdog that keeps trading fair and transparent on exchanges like NSE and BSE. It sets strict rules on company disclosures, IPOs, and broker practices so everyday investors are protected from manipulation.",
        followUps: [
          "How does an IPO work in the primary market?",
          "How is the market moving this week?"
        ]
      };
    }

    // 8. IPO, primary & secondary market
    if (q.includes("ipo") || q.includes("primary") || q.includes("secondary")) {
      return {
        answer:
          "When a company raises fresh capital from the public for the first time, it launches an IPO in the Primary Market. Once those shares are listed on NSE or BSE, everyday buyers and sellers trade them back and forth in what's called the Secondary Market.",
        followUps: [
          "What causes a Bull or Bear market?",
          "How does SEBI regulate listed companies?"
        ]
      };
    }

    // 9. Bull, Bear, volatility, profit booking
    if (q.includes("bull") || q.includes("bear") || q.includes("volatil") || q.includes("profit booking")) {
      return {
        answer:
          "A Bull market is when stock prices climb steadily on strong economic optimism, whereas a Bear market is a prolonged downward phase. Even in a healthy market, you'll often see 'profit booking'—which simply means investors selling a portion of their shares after a good run to lock in their gains.",
        followUps: [
          "How is the market moving this week?",
          "How do global cues affect Indian markets?"
        ]
      };
    }

    // Default natural conversational response
    return {
      answer:
        "That's a great topic to explore. In the stock market, day-to-day movements usually come down to company earnings, sector rotation across Banking and IT, and institutional money flows—like we're seeing right now in \"" +
        topHeadline +
        "\". Would you like to look at how the indices are moving this week, or unpack a specific market concept?",
      followUps: [
        "How is the market moving this week?",
        "How do global cues affect Indian stocks?"
      ]
    };
  }

  async function askGeneralMarketTrends(question) {
    const cleanQ = String(question || "").trim();
    if (!cleanQ) return null;

    const threadKey = "general::homepage";
    const priorTurns = getThreadHistory(threadKey);

    const siteContext = getRecentSiteContextSummary();
    const systemInstruction =
      "You are Stocks 360 AI, a warm, natural, conversational market trends & financial education assistant on Stocks 360. " +
      "Speak like a friendly, knowledgeable human market mentor chatting directly with the user:\n" +
      "1. Never use stiff or robotic labels like 'Current Market Trends Overview:', 'Summary:', or bulleted meta-headers.\n" +
      "2. Flow naturally in conversation, building on earlier messages if the user asks a follow-up.\n" +
      "3. Share clear, concise insights (2 to 4 natural sentences) about market trends, sectors (Banking, IT, Mid-caps, Nifty 50, Sensex), macro cues, and current Stocks 360 headlines.\n" +
      "4. Keep everything strictly educational (no buy/sell stock tips).\n" +
      "5. At the very end on a new line, optionally write 'FOLLOW_UPS:' followed by 2 short, natural questions the user might want to ask next, separated by '|'.";

    const userPrompt =
      (siteContext ? "CURRENT STOCKS 360 HEADLINES:\n" + siteContext + "\n\n" : "") +
      "USER MESSAGE: " +
      cleanQ;

    const rawModelText = await callGeminiModel(systemInstruction, userPrompt, false, priorTurns);
    const fallbackObj = buildNaturalMarketFallback(cleanQ, priorTurns);

    let answerText = fallbackObj.answer;
    let followUps = fallbackObj.followUps;

    if (rawModelText) {
      const parts = rawModelText.split(/FOLLOW_UPS:/i);
      answerText = cleanNaturalText(parts[0]);
      if (parts[1]) {
        const parsedFollowUps = parts[1]
          .split("|")
          .map((s) => s.replace(/^[-*•\d.)\s"']+|["'\s]+$/g, "").trim())
          .filter((s) => s.length > 5 && s.length < 85);
        if (parsedFollowUps.length > 0) {
          followUps = parsedFollowUps.slice(0, 2);
        }
      }
    }

    const history = pushToThread(threadKey, cleanQ, answerText, followUps);

    return {
      threadKey: threadKey,
      question: cleanQ,
      answer: answerText,
      suggestions: followUps,
      history: history
    };
  }

  // ---------------- NATURAL CONVERSATIONAL CHAT UI RENDERER ----------------
  function renderAiResponseCard(containerEl, resultObj, onSelectFollowUp) {
    if (!containerEl || !resultObj) return;

    const history =
      resultObj.history && resultObj.history.length > 0
        ? resultObj.history
        : [{ question: resultObj.question, answer: resultObj.answer }];

    const suggestions = resultObj.suggestions || [];

    const turnsHtml = history
      .map(
        (turn) => `
        <div class="ai-chat-turn" style="margin-bottom: 14px;">
          <div style="display:flex; justify-content:flex-end; margin-bottom: 8px;">
            <div style="background:#eff6ff; color:#1e3a8a; border:1px solid #bfdbfe; padding:8px 14px; border-radius:16px 16px 4px 16px; max-width:85%; font-size:0.95rem; font-weight:500; line-height:1.45;">
              ${escapeHtml(turn.question)}
            </div>
          </div>
          <div style="display:flex; justify-content:flex-start;">
            <div style="background:#ffffff; color:#1e293b; border:1px solid #e2e8f0; padding:12px 16px; border-radius:16px 16px 16px 4px; max-width:92%; font-size:0.98rem; line-height:1.65; box-shadow:0 1px 2px rgba(15,23,42,0.04);">
              ${escapeHtml(turn.answer)}
            </div>
          </div>
        </div>
      `
      )
      .join("");

    const chipsHtml =
      suggestions.length > 0
        ? `
        <div class="ai-natural-suggestions" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
          ${suggestions
            .map(
              (q) =>
                `<button type="button" class="quick-ticker-pill ai-followup-chip" data-followup="${escapeHtml(
                  q
                )}" style="text-align:left; font-size:0.85rem; padding:6px 13px; border-radius:999px; background:#f8fafc; border:1px solid #cbd5e1; color:#1e40af; cursor:pointer;">${escapeHtml(
                  q
                )}</button>`
            )
            .join("")}
        </div>
      `
        : "";

    containerEl.innerHTML = `
      <div class="ask360-ai-card" tabindex="-1" style="padding:14px 16px; background:#f8fafc; border-radius:14px; border:1px solid #e2e8f0;">
        <div class="ai-chat-stream" style="max-height:340px; overflow-y:auto; padding-right:4px;">
          ${turnsHtml}
        </div>
        ${chipsHtml}
      </div>
    `;

    const streamEl = containerEl.querySelector(".ai-chat-stream");
    if (streamEl) {
      streamEl.scrollTop = streamEl.scrollHeight;
    }

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
