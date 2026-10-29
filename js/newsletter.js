// newsletter.js - Connected with StocksDataStore for live public newsletters
document.addEventListener("DOMContentLoaded", function () {
  const list = document.getElementById("newsletter-list");
  const detail = document.getElementById("newsletter-detail");
  const titleEl = document.getElementById("nl-detail-title");
  const authorEl = document.getElementById("nl-detail-author");
  const readTimeEl = document.getElementById("nl-detail-read-time");
  const publishedEl = document.getElementById("nl-detail-published-time");
  const contentEl = document.getElementById("nl-detail-content");
  const glossaryEl = document.getElementById("nl-detail-glossary");
  const keywordsEl = document.getElementById("nl-detail-keywords");
  const backBtn = document.getElementById("nl-back-to-list");

  const ask360Btn = document.getElementById("nl-ask360-btn");
  const ask360Box = document.getElementById("nl-ask360-box");
  const ask360Input = document.getElementById("nl-ask360-input");
  const ask360Send = document.getElementById("nl-ask360-send");
  const ask360Response = document.getElementById("nl-ask360-response");

  function calculateReadTime(text) {
    if (!text) return "Read time: 2 min";
    const plain = text.replace(/<[^>]*>/g, " ");
    const words = plain.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 180));
    return `Read time: ${minutes} min`;
  }

  function renderPublicNewsletters() {
    const all = typeof StocksDataStore !== "undefined" ? StocksDataStore.getNewsletters() : [];
    const ul = document.querySelector(".news-headings-list") || (list ? list.querySelector("ul") : null);

    if (!ul) return;
    ul.innerHTML = "";

    if (all.length === 0) {
      ul.innerHTML = `<li style="padding:20px; text-align:center; color:#64748b;">No weekly newsletters published yet.</li>`;
      return;
    }

    all.forEach(item => {
      const li = document.createElement("li");
      li.className = "news-card-item";
      li.innerHTML = `
        <article class="public-news-card">
          <div class="news-card-top">
            <span class="news-tag newsletter-tag">Weekly Wrap</span>
            <span class="news-date">${escapeHtml(item.published || "")}</span>
          </div>
          <h2 class="news-card-heading">
            <a href="#" class="news-heading-link" data-newsletter-id="${item.id}">
              ${escapeHtml(item.title)}
            </a>
          </h2>
          <p class="news-card-author">By <strong>${escapeHtml(item.author)}</strong></p>
          <p class="news-card-synopsis">${escapeHtml(item.content.substring(0, 160))}...</p>
          <div class="news-card-footer">
            <span class="read-time-pill">${calculateReadTime(item.content)}</span>
            <a href="#" class="read-article-link" data-newsletter-id="${item.id}">Read Full Edition &rarr;</a>
          </div>
        </article>
      `;
      ul.appendChild(li);
    });

    ul.querySelectorAll("[data-newsletter-id]").forEach(link => {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const id = this.getAttribute("data-newsletter-id");
        history.pushState({ view: "detail", id: id }, "", "#nl-" + id);
        showDetail(id);
      });
    });
  }

  function showList() {
    detail.hidden = true;
    list.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showDetail(id) {
    const item = typeof StocksDataStore !== "undefined" ? StocksDataStore.getNewsletterById(id) : null;
    if (!item) return;

    titleEl.textContent = item.title;
    authorEl.textContent = "Written by: " + item.author;
    publishedEl.textContent = "Published: " + item.published;
    contentEl.textContent = item.content;
    readTimeEl.textContent = calculateReadTime(item.content);

    if (item.glossary && item.glossary.trim() !== "") {
      glossaryEl.innerHTML = "<strong>Glossary &amp; Terms:</strong><br>" + escapeHtml(item.glossary);
      glossaryEl.hidden = false;
    } else {
      glossaryEl.hidden = true;
    }

    if (item.keywords && item.keywords.trim() !== "") {
      keywordsEl.innerHTML = "<strong>Keywords:</strong> " + escapeHtml(item.keywords);
      keywordsEl.hidden = false;
    } else {
      keywordsEl.hidden = true;
    }

    if (ask360Box) {
      ask360Box.hidden = true;
      if (ask360Btn) ask360Btn.setAttribute("aria-expanded", "false");
      if (ask360Input) ask360Input.value = "";
      if (ask360Response) ask360Response.innerHTML = "";
    }

    list.hidden = true;
    detail.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    titleEl.focus();

    if (typeof window.speakWithPitch === "function") {
      window.speakWithPitch(item.title, true);
    }
  }

  if (backBtn) {
    backBtn.addEventListener("click", function (e) {
      e.preventDefault();
      history.pushState({ view: "list" }, "", "newsletter.html");
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
      const q = ask360Input.value.trim();
      if (!q) return;
      ask360Response.innerHTML = `
        <div class="ask360-ai-card">
          <p><strong>Ask 360 AI Assistant:</strong></p>
          <p>Question: "<em>${escapeHtml(q)}</em>"</p>
          <p style="margin-top:6px; color:#1e40af;">Market trends in weekly newsletters highlight overall sector performances and index benchmarks. Refer to the key glossary terms for fundamental definitions.</p>
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
  renderPublicNewsletters();

  if (hash && hash.startsWith("#nl-")) {
    const id = hash.replace("#nl-", "");
    showDetail(id);
  }
});
