// news.js
document.addEventListener("DOMContentLoaded", function () {

  const newsData = {
    "news-1": {
      title: "Indian markets show mixed performance this week",
      author: "Written by: Rahul Sharma",
      published: "Published: 27 Oct 2026, 10:30 AM",
      synopsis: "Banking and IT sectors remained in focus as markets moved in a narrow range during the week.",
      content: "Indian stock markets showed mixed performance this week. Banking and IT sectors remained in focus as markets moved in a narrow range. Investors stayed cautious ahead of important economic data. Overall sentiment remained balanced with selective buying in quality stocks.",
      glossary: "Volatility: The degree of variation in trading prices. Sensex: Benchmark index of BSE.",
      keywords: "markets, banking, IT, performance"
    },
    "news-2": {
      title: "Global cues continue to influence market sentiment",
      author: "Reviewed by Meenugula Gowrishankar",
      published: "Published: 26 Oct 2026, 4:15 PM",
      synopsis: "",
      content: "Global cues and domestic economic data continued to influence market sentiment. International developments and movements in global markets played an important role in shaping investor mood. Learners should understand that short-term movements are normal and focus on long-term learning.",
      glossary: "",
      keywords: "global cues, sentiment, markets"
    },
    "news-3": {
      title: "Understanding market volatility in simple terms",
      author: "Written by: Priya Nair",
      published: "Published: 25 Oct 2026, 11:00 AM",
      synopsis: "A simple educational explanation of why stock prices move up and down.",
      content: "Market volatility means the speed and amount of price changes. High volatility means prices are moving up and down quickly. Low volatility means prices are more stable. Understanding volatility helps learners stay calm during market ups and downs and focus on education rather than short-term noise.",
      glossary: "Volatility: How much and how quickly prices change. Stable: Prices that do not move much.",
      keywords: "volatility, education, learning"
    }
  };

  const newsList = document.getElementById("news-list");
  const newsDetail = document.getElementById("news-detail");
  const detailTitle = document.getElementById("detail-title");
  const detailAuthor = document.getElementById("detail-author");
  const detailReadTime = document.getElementById("detail-read-time");
  const detailPublishedTime = document.getElementById("detail-published-time");
  const detailSynopsis = document.getElementById("detail-synopsis");
  const detailContent = document.getElementById("detail-content");
  const detailGlossary = document.getElementById("detail-glossary");
  const detailKeywords = document.getElementById("detail-keywords");
  const backToList = document.getElementById("back-to-list");

  const ask360Btn = document.getElementById("detail-ask360-btn");
  const ask360Box = document.getElementById("detail-ask360-box");
  const ask360Input = document.getElementById("detail-ask360-input");
  const ask360Send = document.getElementById("detail-ask360-send");
  const ask360Response = document.getElementById("detail-ask360-response");

  function calculateReadTime(text) {
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return "Read time: " + minutes + " min";
  }

  function showList() {
    newsDetail.hidden = true;
    newsList.hidden = false;
  }

  function showDetail(newsId) {
    const news = newsData[newsId];
    if (!news) return;

    detailTitle.textContent = news.title;
    detailAuthor.textContent = news.author;
    detailPublishedTime.textContent = news.published;
    detailContent.textContent = news.content;
    detailReadTime.textContent = calculateReadTime(news.content);

    if (news.synopsis && news.synopsis.trim() !== "") {
      detailSynopsis.textContent = news.synopsis;
      detailSynopsis.hidden = false;
    } else {
      detailSynopsis.hidden = true;
    }

    if (news.glossary && news.glossary.trim() !== "") {
      detailGlossary.innerHTML = "<strong>Glossary:</strong><br>" + news.glossary;
      detailGlossary.hidden = false;
    } else {
      detailGlossary.hidden = true;
    }

    if (news.keywords && news.keywords.trim() !== "") {
      detailKeywords.innerHTML = "<strong>Keywords:</strong> " + news.keywords;
      detailKeywords.hidden = false;
    } else {
      detailKeywords.hidden = true;
    }

    ask360Box.hidden = true;
    ask360Btn.setAttribute("aria-expanded", "false");
    ask360Input.value = "";
    ask360Response.innerHTML = "";

    newsList.hidden = true;
    newsDetail.hidden = false;
    detailTitle.focus();
  }

  // Click on news heading
  document.querySelectorAll(".news-heading-link").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const newsId = link.getAttribute("data-news-id");
      history.pushState({ view: "detail", id: newsId }, "", "#news-" + newsId);
      showDetail(newsId);
    });
  });

  // Back to list link
  if (backToList) {
    backToList.addEventListener("click", function (e) {
      e.preventDefault();
      history.pushState({ view: "list" }, "", "news.html");
      showList();
    });
  }

  // Browser Back / Forward button
  window.addEventListener("popstate", function (e) {
    if (e.state && e.state.view === "detail") {
      showDetail(e.state.id);
    } else {
      showList();
    }
  });

  // Ask 360
  if (ask360Btn) {
    ask360Btn.addEventListener("click", function () {
      const isHidden = ask360Box.hidden;
      ask360Box.hidden = !isHidden;
      ask360Btn.setAttribute("aria-expanded", isHidden ? "true" : "false");
      if (isHidden) ask360Input.focus();
    });
  }

  if (ask360Send) {
    ask360Send.addEventListener("click", function () {
      const question = ask360Input.value.trim();
      if (question === "") {
        ask360Response.textContent = "Please type your question first.";
        return;
      }
      ask360Response.innerHTML = "<p><strong>Ask 360:</strong> Thank you for your question. Real AI answers will work after Gemini API is connected. Your question was: \"" + question + "\"</p>";
      ask360Input.value = "";
    });
  }
});
