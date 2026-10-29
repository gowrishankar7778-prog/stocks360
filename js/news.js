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
    const listUl = document.querySelector(".news-headings-list") || newsList.querySelector("ul");

    if (!listUl) return;
    listUl.innerHTML = "";

    if (allNews.length === 0) {
      listUl.innerHTML = `<li style="padding:20px; text-align:center; color:#64748b;">No news articles published yet. Check back soon!</li>`;
      return;
    }

    allNews.forEach(item => {
      const li = document.createElement("li");
      li.className = "news-card-item";
      li.innerHTML = `
        <article class="public-news-card">
          <div class="news-card-top">
            <span class="news-tag">${escapeHtml(item.category || "Market News")}</span>
            <span class="news-date">${escapeHtml(item.published || "")}</span>
          </div>
          <h2 class="news-card-heading">
            <a href="#" class="news-heading-link" data-news-id="${item.id}">
              ${escapeHtml(item.title)}
            </a>
          </h2>
          <p class="news-card-author">By <strong>${escapeHtml(item.author)}</strong></p>
          ${item.synopsis ? `<p class="news-card-synopsis">${escapeHtml(item.synopsis)}</p>` : ""}
          <div class="news-card-footer">
            <span class="read-time-pill">${calculateReadTime(item.content)}</span>
            <a href="#" class="read-article-link" data-news-id="${item.id}">Read Full Article &rarr;</a>
          </div>
        </article>
      `;
      listUl.appendChild(li);
    });

    // Attach click listeners to all article links
    listUl.querySelectorAll("[data-news-id]").forEach(link => {
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
    detailAuthor.textContent = "Written by: " + news.author;
    detailPublishedTime.textContent = "Published: " + (news.published || "Recent");
    detailContent.innerHTML = news.content;
    detailReadTime.textContent = calculateReadTime(news.content);

    if (news.synopsis && news.synopsis.trim() !== "") {
      detailSynopsis.textContent = news.synopsis;
      detailSynopsis.hidden = false;
    } else {
      detailSynopsis.hidden = true;
    }

    if (news.glossary && news.glossary.trim() !== "") {
      detailGlossary.innerHTML = "<strong>Glossary &amp; Key Terms:</strong><br>" + escapeHtml(news.glossary);
      detailGlossary.hidden = false;
    } else {
      detailGlossary.hidden = true;
    }

    if (news.keywords && news.keywords.trim() !== "") {
      detailKeywords.innerHTML = "<strong>Keywords:</strong> " + escapeHtml(news.keywords);
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

    // Voice announcement if special accessibility is on
    if (typeof window.speakWithPitch === "function") {
      window.speakWithPitch(news.title + ". Written by " + news.author, true);
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

  // Ask 360 Drawer
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
          <p>Analyzing: "<em>${escapeHtml(question)}</em>"</p>
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

  // Check URL hash for direct article link (#news-news-1)
  const hash = window.location.hash;
  renderPublicNewsList();

  if (hash && hash.startsWith("#news-")) {
    const id = hash.replace("#news-", "");
    showDetail(id);
  }
});
