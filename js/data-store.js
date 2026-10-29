/**
 * Stocks 360 - Unified Data Store (data-store.js)
 * Manages client-side persistence for News, Newsletters, Learning Units, and Settings.
 * Supports localStorage with automatic seed data, full CRUD, and JSON import/export.
 */

const StocksDataStore = (function () {
  const STORAGE_KEYS = {
    NEWS: "stocks360_news_data",
    NEWSLETTERS: "stocks360_newsletter_data",
    LEARN_UNITS: "stocks360_learn_units",
    COMMENTS: "stocks360_comments",
    SITE_SETTINGS: "stocks360_site_settings"
  };

  // Default seed data
  const SEED_NEWS = [
    {
      id: "news-1",
      title: "Indian markets show mixed performance this week",
      author: "Rahul Sharma",
      published: "27 Oct 2026, 10:30 AM",
      publishedAt: 1793163600000,
      synopsis: "Banking and IT sectors remained in focus as markets moved in a narrow range during the week.",
      content: "Indian stock markets showed mixed performance this week. Banking and IT sectors remained in focus as markets moved in a narrow range. Investors stayed cautious ahead of important economic data. Overall sentiment remained balanced with selective buying in quality stocks.",
      glossary: "Volatility: The degree of variation in trading prices. Sensex: Benchmark index of BSE.",
      keywords: "markets, banking, IT, performance",
      category: "Market Update"
    },
    {
      id: "news-2",
      title: "Global cues continue to influence market sentiment",
      author: "Meenugula Gowrishankar",
      published: "26 Oct 2026, 4:15 PM",
      publishedAt: 1793097900000,
      synopsis: "International developments and global indices guide domestic market movements.",
      content: "Global cues and domestic economic data continued to influence market sentiment. International developments and movements in global markets played an important role in shaping investor mood. Learners should understand that short-term movements are normal and focus on long-term learning.",
      glossary: "Global Cues: Signals from international financial markets such as US, Europe, and Asia.",
      keywords: "global cues, sentiment, markets",
      category: "Global Economy"
    },
    {
      id: "news-3",
      title: "Understanding market volatility in simple terms",
      author: "Priya Nair",
      published: "25 Oct 2026, 11:00 AM",
      publishedAt: 1793002200000,
      synopsis: "A simple educational explanation of why stock prices move up and down.",
      content: "Market volatility means the speed and amount of price changes. High volatility means prices are moving up and down quickly. Low volatility means prices are more stable. Understanding volatility helps learners stay calm during market ups and downs and focus on education rather than short-term noise.",
      glossary: "Volatility: How much and how quickly prices change. Stable: Prices that do not move much.",
      keywords: "volatility, education, learning",
      category: "Educational"
    }
  ];

  const SEED_NEWSLETTERS = [
    {
      id: "nl-1",
      title: "Weekly Market Overview - 27 Oct 2026",
      author: "Rahul Sharma",
      published: "27 Oct 2026, 10:00 AM",
      content: "This week the market showed mixed trends. Major indices moved in a narrow range. Banking and IT sectors remained active. Global cues had a moderate impact on investor sentiment. Learners are advised to focus on understanding the reasons behind market movements rather than short-term price changes.",
      glossary: "Index: A group of stocks that represent a section of the market. Sentiment: Overall mood of investors.",
      keywords: "weekly overview, markets, banking, IT"
    },
    {
      id: "nl-2",
      title: "Weekly Market Overview - 20 Oct 2026",
      author: "Priya Nair",
      published: "20 Oct 2026, 10:00 AM",
      content: "Markets remained cautious during the week. Investors waited for important economic data. Selective buying was seen in a few quality stocks. Understanding these patterns helps in building long-term knowledge.",
      glossary: "",
      keywords: "markets, cautious, economic data"
    },
    {
      id: "nl-3",
      title: "Weekly Market Overview - 13 Oct 2026",
      author: "Meenugula Gowrishankar",
      published: "13 Oct 2026, 10:00 AM",
      content: "The week started on a positive note but later saw some profit booking. Overall, the market remained range-bound. Educational focus should remain on learning concepts rather than predicting short-term moves.",
      glossary: "Profit booking: Selling stocks after a rise in price to lock gains.",
      keywords: "range-bound, profit booking, education"
    }
  ];

  const SEED_UNITS = [
    {
      id: "unit-1",
      title: "Unit 1: Introduction to Stock Markets",
      description: "Basics of financial markets, reasons to invest, and primary regulators.",
      subunits: [
        {
          id: "su-1",
          title: "1. Why Stock Market?",
          body: "The stock market allows companies to raise money by selling shares to the public. It also gives people a chance to own a small part of companies and benefit from their growth over time.",
          takeaways: "Stock market helps companies raise capital. Investors can become part owners of companies."
        },
        {
          id: "su-2",
          title: "2. The Regulators of the Stock Market",
          body: "In India, SEBI (Securities and Exchange Board of India) is the main regulator of the stock market. It protects investors and ensures fair practices.",
          takeaways: "SEBI regulates the Indian stock market. Regulation helps maintain trust and fairness."
        }
      ]
    },
    {
      id: "unit-2",
      title: "Unit 2: Understanding Market Participants",
      description: "Learn about retail investors, institutions, domestic players, and brokers.",
      subunits: [
        {
          id: "su-3",
          title: "1. Who are the Investors?",
          body: "Investors are individuals or institutions who buy shares with the aim of earning returns over a period of time. They can be retail investors or large institutional investors.",
          takeaways: "There are retail and institutional investors. Different investors have different goals and time horizons."
        }
      ]
    }
  ];

  // Helper getters and setters
  function getItem(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error("StocksDataStore read error:", e);
      return fallback;
    }
  }

  function setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("StocksDataStore write error:", e);
      return false;
    }
  }

  // Initialize seed data if not present
  function init() {
    if (!localStorage.getItem(STORAGE_KEYS.NEWS)) {
      setItem(STORAGE_KEYS.NEWS, SEED_NEWS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.NEWSLETTERS)) {
      setItem(STORAGE_KEYS.NEWSLETTERS, SEED_NEWSLETTERS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.LEARN_UNITS)) {
      setItem(STORAGE_KEYS.LEARN_UNITS, SEED_UNITS);
    }
  }

  init();

  return {
    // ---------------- NEWS API ----------------
    getNews: function () {
      return getItem(STORAGE_KEYS.NEWS, SEED_NEWS);
    },

    getNewsById: function (id) {
      const allNews = this.getNews();
      return allNews.find(item => item.id === id) || null;
    },

    saveNews: function (article) {
      const allNews = this.getNews();
      const newArticle = {
        id: article.id || "news-" + Date.now(),
        title: article.title || "Untitled News",
        author: article.author || "Stocks 360 Editorial",
        published: article.published || new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        publishedAt: article.publishedAt || Date.now(),
        synopsis: article.synopsis || "",
        content: article.content || "",
        glossary: article.glossary || "",
        keywords: article.keywords || "",
        category: article.category || "General"
      };

      // Check if update or insert
      const existingIdx = allNews.findIndex(n => n.id === newArticle.id);
      if (existingIdx >= 0) {
        allNews[existingIdx] = newArticle;
      } else {
        allNews.unshift(newArticle); // newest first
      }

      setItem(STORAGE_KEYS.NEWS, allNews);
      return newArticle;
    },

    deleteNews: function (id) {
      let allNews = this.getNews();
      allNews = allNews.filter(n => n.id !== id);
      setItem(STORAGE_KEYS.NEWS, allNews);
      return true;
    },

    // ---------------- NEWSLETTERS API ----------------
    getNewsletters: function () {
      return getItem(STORAGE_KEYS.NEWSLETTERS, SEED_NEWSLETTERS);
    },

    getNewsletterById: function (id) {
      const all = this.getNewsletters();
      return all.find(item => item.id === id) || null;
    },

    saveNewsletter: function (nl) {
      const all = this.getNewsletters();
      const newNl = {
        id: nl.id || "nl-" + Date.now(),
        title: nl.title || "Weekly Market Overview",
        author: nl.author || "Stocks 360 Research",
        published: nl.published || new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        content: nl.content || "",
        glossary: nl.glossary || "",
        keywords: nl.keywords || ""
      };

      const existingIdx = all.findIndex(n => n.id === newNl.id);
      if (existingIdx >= 0) {
        all[existingIdx] = newNl;
      } else {
        all.unshift(newNl);
      }

      setItem(STORAGE_KEYS.NEWSLETTERS, all);
      return newNl;
    },

    deleteNewsletter: function (id) {
      let all = this.getNewsletters();
      all = all.filter(n => n.id !== id);
      setItem(STORAGE_KEYS.NEWSLETTERS, all);
      return true;
    },

    // ---------------- LEARN UNITS API ----------------
    getUnits: function () {
      return getItem(STORAGE_KEYS.LEARN_UNITS, SEED_UNITS);
    },

    getUnitById: function (unitId) {
      const units = this.getUnits();
      return units.find(u => u.id === unitId) || null;
    },

    saveUnit: function (unit) {
      const units = this.getUnits();
      const newUnit = {
        id: unit.id || "unit-" + (units.length + 1),
        title: unit.title || "Untitled Unit",
        description: unit.description || "",
        subunits: unit.subunits || []
      };

      const existingIdx = units.findIndex(u => u.id === newUnit.id);
      if (existingIdx >= 0) {
        units[existingIdx] = newUnit;
      } else {
        units.push(newUnit);
      }

      setItem(STORAGE_KEYS.LEARN_UNITS, units);
      return newUnit;
    },

    deleteUnit: function (unitId) {
      let units = this.getUnits();
      units = units.filter(u => u.id !== unitId);
      setItem(STORAGE_KEYS.LEARN_UNITS, units);
      return true;
    },

    saveSubunit: function (unitId, subunit) {
      const units = this.getUnits();
      const targetUnit = units.find(u => u.id === unitId);
      if (!targetUnit) return null;

      if (!targetUnit.subunits) targetUnit.subunits = [];

      const newSubunit = {
        id: subunit.id || "su-" + Date.now(),
        title: subunit.title,
        body: subunit.body,
        takeaways: subunit.takeaways || ""
      };

      const existingIdx = targetUnit.subunits.findIndex(s => s.id === newSubunit.id);
      if (existingIdx >= 0) {
        targetUnit.subunits[existingIdx] = newSubunit;
      } else {
        targetUnit.subunits.push(newSubunit);
      }

      setItem(STORAGE_KEYS.LEARN_UNITS, units);
      return newSubunit;
    },

    // ---------------- EXPORT / IMPORT (BACKUP) ----------------
    exportBackup: function () {
      const payload = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        news: this.getNews(),
        newsletters: this.getNewsletters(),
        units: this.getUnits()
      };
      return JSON.stringify(payload, null, 2);
    },

    importBackup: function (jsonString) {
      try {
        const payload = JSON.parse(jsonString);
        if (payload.news) setItem(STORAGE_KEYS.NEWS, payload.news);
        if (payload.newsletters) setItem(STORAGE_KEYS.NEWSLETTERS, payload.newsletters);
        if (payload.units) setItem(STORAGE_KEYS.LEARN_UNITS, payload.units);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    resetToDefault: function () {
      setItem(STORAGE_KEYS.NEWS, SEED_NEWS);
      setItem(STORAGE_KEYS.NEWSLETTERS, SEED_NEWSLETTERS);
      setItem(STORAGE_KEYS.LEARN_UNITS, SEED_UNITS);
    }
  };
})();

// Attach to window
if (typeof window !== "undefined") {
  window.StocksDataStore = StocksDataStore;
}
