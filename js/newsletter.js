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

  // Audio Player DOM Elements
  const listenArticleBtn = document.getElementById("nl-listen-article-btn");
  const audioPlayerCard = document.getElementById("nl-audio-player-card");
  const audioEl = document.getElementById("nl-html5-audio");
  const playPauseBtn = document.getElementById("nl-audio-play-pause-btn");
  const playPauseIcon = document.getElementById("nl-audio-play-icon");
  const playPauseLabel = document.getElementById("nl-audio-play-label");
  const rewind10Btn = document.getElementById("nl-audio-rewind-10-btn");
  const forward10Btn = document.getElementById("nl-audio-forward-10-btn");
  const seekSlider = document.getElementById("nl-audio-seek-slider");
  const currentTimeEl = document.getElementById("nl-audio-current-time");
  const totalDurationEl = document.getElementById("nl-audio-total-duration");
  const speedSelect = document.getElementById("nl-audio-speed-select");

  function calculateReadTime(text) {
    if (!text) return "Read time: 2 min";
    const plain = text.replace(/<[^>]*>/g, " ");
    const words = plain.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 180));
    return `Read time: ${minutes} min`;
  }

  function renderPublicNewsletters() {
    const all = typeof StocksDataStore !== "undefined" ? StocksDataStore.getNewsletters() : [];
    const container = document.querySelector(".news-headings-list");

    if (!container) return;
    container.innerHTML = "";

    if (all.length === 0) {
      container.innerHTML = `<p style="padding:20px; text-align:center; color:#64748b;">No weekly newsletters published yet.</p>`;
      return;
    }

    all.forEach(item => {
      const card = document.createElement("article");
      card.className = "public-news-card";
      card.innerHTML = `
        <h2 class="news-card-heading">
          <a href="#" class="news-heading-link" data-newsletter-id="${item.id}">
            ${escapeHtml(item.title)}
          </a>
        </h2>
        <p class="article-meta-line">${calculateReadTime(item.content)}</p>
        <p class="article-meta-line">Published on: ${escapeHtml(item.published || "Recent")}</p>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll("[data-newsletter-id]").forEach(link => {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const id = this.getAttribute("data-newsletter-id");
        history.pushState({ view: "detail", id: id }, "", "#nl-" + id);
        showDetail(id);
      });
    });
  }

  function showList() {
    if (typeof StocksAudioEngine !== "undefined") {
      StocksAudioEngine.stopActivePlayer();
    }
    detail.hidden = true;
    list.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  let currentNewsletterItem = null;

  function showDetail(id) {
    const item = typeof StocksDataStore !== "undefined" ? StocksDataStore.getNewsletterById(id) : null;
    if (!item) return;
    currentNewsletterItem = item;

    titleEl.textContent = item.title;
    readTimeEl.textContent = calculateReadTime(item.content);
    publishedEl.textContent = "Published on: " + (item.published || "Recent");
    if (authorEl) {
      authorEl.hidden = true;
    }
    contentEl.innerHTML = `<p>${escapeHtml(item.content)}</p>`;

    if (item.glossary && item.glossary.trim() !== "") {
      glossaryEl.innerHTML = "<h2>Glossary</h2><p>" + escapeHtml(item.glossary) + "</p>";
      glossaryEl.hidden = false;
    } else {
      glossaryEl.hidden = true;
    }

    const takeawaysText = item.takeaways || "";
    if (takeawaysText && takeawaysText.trim() !== "") {
      keywordsEl.innerHTML = "<h2>Key Takeaways</h2><p>" + escapeHtml(takeawaysText) + "</p>";
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

    if (typeof StocksAudioEngine !== "undefined") {
      StocksAudioEngine.mountArticlePlayer(item, {
        triggerBtn: listenArticleBtn,
        containerEl: audioPlayerCard,
        audioEl: audioEl,
        playPauseBtn: playPauseBtn,
        playPauseIcon: playPauseIcon,
        playPauseLabel: playPauseLabel,
        rewind10Btn: rewind10Btn,
        forward10Btn: forward10Btn,
        seekSlider: seekSlider,
        currentTimeEl: currentTimeEl,
        totalDurationEl: totalDurationEl,
        speedSelect: speedSelect
      });
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

  async function handleNewsletterAsk() {
    if (!ask360Input || !ask360Response) return;
    const q = ask360Input.value.trim();
    if (!q) {
      ask360Response.innerHTML = `<p class="ask360-error">Please type your question about this newsletter first.</p>`;
      return;
    }

    ask360Input.value = "";
    const existingStream = ask360Response.querySelector(".ai-chat-stream");
    if (existingStream) {
      const tempTurn = document.createElement("div");
      tempTurn.style.marginBottom = "10px";
      tempTurn.innerHTML = `<p style="color:#2563eb; font-size:0.9rem; font-weight:500; margin:6px 0;">Thinking...</p>`;
      existingStream.appendChild(tempTurn);
      existingStream.scrollTop = existingStream.scrollHeight;
    } else {
      ask360Response.innerHTML = `<div class="ask360-ai-card" style="padding:12px 16px;"><p style="color:#2563eb; font-weight:500; margin:0;">Thinking...</p></div>`;
    }

    if (typeof StocksGeminiAI !== "undefined" && currentNewsletterItem) {
      const result = await StocksGeminiAI.askGroundedContentQuestion(
        q,
        currentNewsletterItem,
        "newsletter"
      );
      if (result) {
        StocksGeminiAI.renderAiResponseCard(ask360Response, result, function (followUpQ) {
          ask360Input.value = followUpQ;
          handleNewsletterAsk();
        });
        return;
      }
    }
  }

  if (ask360Send) {
    ask360Send.addEventListener("click", handleNewsletterAsk);
  }

  if (ask360Input) {
    ask360Input.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleNewsletterAsk();
      }
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
