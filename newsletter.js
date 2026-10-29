// newsletter.js
document.addEventListener("DOMContentLoaded", function () {

  const newsletterData = {
    "nl-1": {
      title: "Weekly Market Overview - 27 Oct 2026",
      author: "Written by: Rahul Sharma",
      published: "Published: 27 Oct 2026, 10:00 AM",
      content: "This week the market showed mixed trends. Major indices moved in a narrow range. Banking and IT sectors remained active. Global cues had a moderate impact on investor sentiment. Learners are advised to focus on understanding the reasons behind market movements rather than short-term price changes.",
      glossary: "Index: A group of stocks that represent a section of the market. Sentiment: Overall mood of investors.",
      keywords: "weekly overview, markets, banking, IT"
    },
    "nl-2": {
      title: "Weekly Market Overview - 20 Oct 2026",
      author: "Written by: Priya Nair",
      published: "Published: 20 Oct 2026, 10:00 AM",
      content: "Markets remained cautious during the week. Investors waited for important economic data. Selective buying was seen in a few quality stocks. Understanding these patterns helps in building long-term knowledge.",
      glossary: "",
      keywords: "markets, cautious, economic data"
    },
    "nl-3": {
      title: "Weekly Market Overview - 13 Oct 2026",
      author: "Reviewed by Meenugula Gowrishankar",
      published: "Published: 13 Oct 2026, 10:00 AM",
      content: "The week started on a positive note but later saw some profit booking. Overall, the market remained range-bound. Educational focus should remain on learning concepts rather than predicting short-term moves.",
      glossary: "Profit booking: Selling stocks after a rise in price to lock gains.",
      keywords: "range-bound, profit booking, education"
    }
  };

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
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return "Read time: " + minutes + " min";
  }

  function showList() {
    detail.hidden = true;
    list.hidden = false;
  }

  function showDetail(id) {
    const item = newsletterData[id];
    if (!item) return;

    titleEl.textContent = item.title;
    authorEl.textContent = item.author;
    publishedEl.textContent = item.published;
    contentEl.textContent = item.content;
    readTimeEl.textContent = calculateReadTime(item.content);

    if (item.glossary && item.glossary.trim() !== "") {
      glossaryEl.innerHTML = "<strong>Glossary:</strong><br>" + item.glossary;
      glossaryEl.hidden = false;
    } else {
      glossaryEl.hidden = true;
    }

    if (item.keywords && item.keywords.trim() !== "") {
      keywordsEl.innerHTML = "<strong>Keywords:</strong> " + item.keywords;
      keywordsEl.hidden = false;
    } else {
      keywordsEl.hidden = true;
    }

    if (ask360Box) {
      ask360Box.hidden = true;
      ask360Btn.setAttribute("aria-expanded", "false");
      ask360Input.value = "";
      ask360Response.innerHTML = "";
    }

    list.hidden = true;
    detail.hidden = false;
    titleEl.focus();
  }

  document.querySelectorAll("[data-newsletter-id]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const id = link.getAttribute("data-newsletter-id");
      history.pushState({ view: "detail", id: id }, "", "#nl-" + id);
      showDetail(id);
    });
  });

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
