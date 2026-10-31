// news.js - Connected with StocksDataStore for live public updates
document.addEventListener("DOMContentLoaded", function () {
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
    if (!text) return "Read time: 1 min";
    const plain = text.replace(/<[^>]*>/g, " ");
    const words = plain.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 180));
    return `Read time: ${minutes} min`;
  }

  function renderPublicNewsList() {
    const allNews = typeof StocksDataStore !== "undefined" ? StocksDataStore.getNews() : [];
    const listContainer = document.querySelector(".news-headings-list");

    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (allNews.length === 0) {
      listContainer.innerHTML = `<p style="padding:20px; text-align:center; color:#64748b;">No news articles published yet. Check back soon!</p>`;
      return;
    }

    allNews.forEach(item => {
      const card = document.createElement("article");
      card.className = "public-news-card";
      card.innerHTML = `
        <h2 class="news-card-heading">
          <a href="#" class="news-heading-link" data-news-id="${item.id}">
            ${escapeHtml(item.title)}
          </a>
        </h2>
        <p class="article-meta-line">${calculateReadTime(item.content)}</p>
        <p class="article-meta-line">Published on: ${escapeHtml(item.published || "Recent")}</p>
      `;
      listContainer.appendChild(card);
    });

    listContainer.querySelectorAll("[data-news-id]").forEach(link => {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const newsId = this.getAttribute("data-news-id");
        history.pushState({ view: "detail", id: newsId }, "", "#news-" + newsId);
        showDetail(newsId);
      });
    });
  }

  function showList() {
    newsDetail.hidden = true;
    newsList.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showDetail(newsId) {
    const news = typeof StocksDataStore !== "undefined" ? StocksDataStore.getNewsById(newsId) : null;
    if (!news) return;

    detailTitle.textContent = news.title;
    detailReadTime.textContent = calculateReadTime(news.content);
    detailPublishedTime.textContent = "Published on: " + (news.published || "Recent");
    if (detailAuthor) {
      detailAuthor.hidden = true;
    }
    if (detailSynopsis) {
      detailSynopsis.hidden = true;
    }
    detailContent.innerHTML = `<p>${escapeHtml(news.content)}</p>`;

    if (news.glossary && news.glossary.trim() !== "") {
      detailGlossary.innerHTML = "<h2>Glossary</h2><p>" + escapeHtml(news.glossary) + "</p>";
      detailGlossary.hidden = false;
    } else {
      detailGlossary.hidden = true;
    }

    const takeawaysText = news.takeaways || news.synopsis || "";
    if (takeawaysText && takeawaysText.trim() !== "") {
      detailKeywords.innerHTML = "<h2>Key Takeaways</h2><p>" + escapeHtml(takeawaysText) + "</p>";
      detailKeywords.hidden = false;
    } else {
      detailKeywords.hidden = true;
    }

    if (ask360Box) {
      ask360Box.hidden = true;
      if (ask360Btn) ask360Btn.setAttribute("aria-expanded", "false");
      if (ask360Input) ask360Input.value = "";
      if (ask360Response) ask360Response.innerHTML = "";
    }

    newsList.hidden = true;
    newsDetail.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    detailTitle.focus();

    if (typeof window.speakWithPitch === "function") {
      window.speakWithPitch(news.title, true);
    }
  }

  if (backToList) {
    backToList.addEventListener("click", function (e) {
      e.preventDefault();
      history.pushState({ view: "list" }, "", "news.html");
      showList();
    });
  }

  window.addEventListener("popstate", function (e) {
    if (e.state && e.state.view === "detail") {
      showDetail(e.state.id);
    } else {
      showList();
    }
  });

  if (ask360Btn) {
    ask360Btn.addEventListener("click", function () {
      const isHidden = ask360Box.hidden;
      ask360Box.hidden = !isHidden;
      ask360Btn.setAttribute("aria-expanded", isHidden ? "true" : "false");
      if (isHidden && ask360Input) ask360Input.focus();
    });
  }

  if (ask360Send) {
    ask360Send.addEventListener("click", function () {
      const question = ask360Input.value.trim();
      if (question === "") {
        ask360Response.textContent = "Please type your question first.";
        return;
      }

      ask360Response.innerHTML = `
        <div class="ask360-ai-card">
          <p><strong>Ask 360 AI Assistant:</strong></p>
          <p>Question: "${escapeHtml(question)}"</p>
          <p style="margin-top:6px; color:#1e40af;">In the stock market, terms and movements reflect market supply, demand, and economic fundamentals. Keep exploring the glossary terms below for structured learning.</p>
        </div>
      `;
      ask360Input.value = "";
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const hash = window.location.hash;
  renderPublicNewsList();

  if (hash && hash.startsWith("#news-")) {
    const id = hash.replace("#news-", "");
    showDetail(id);
  }
});
