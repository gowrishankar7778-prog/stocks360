// admin-news.js - Connected with StocksDataStore and AdminAuth
document.addEventListener("DOMContentLoaded", function () {
  // Protect this admin page
  if (typeof AdminAuth !== "undefined") {
    AdminAuth.protectPage();
  }

  const publishNewBtn = document.getElementById("publish-new-btn");
  const publishFormSection = document.getElementById("publish-form-section");
  const cancelBtn = document.getElementById("cancel-publish-btn");
  const finalPublishBtn = document.getElementById("final-publish-btn");
  const previewBtn = document.getElementById("preview-btn");
  const newsListContainer = document.querySelector(".recent-news-section");

  // Form Fields
  const headingInput = document.getElementById("news-heading");
  const writerInput = document.getElementById("writer-name");
  const synopsisInput = document.getElementById("synopsis");
  const bodyTextarea = document.getElementById("main-body") || document.getElementById("news-body-editor");
  const glossaryInput = document.getElementById("glossary");
  const keywordsInput = document.getElementById("keywords");

  // Track if we are editing an existing article
  let editingArticleId = null;

  // Initialize Quill editor if present
  let quillInstance = null;
  const editorEl = document.getElementById("news-body-editor");
  if (editorEl && typeof Quill !== "undefined") {
    quillInstance = new Quill("#news-body-editor", {
      theme: "snow",
      placeholder: "Write or paste article text, formatting, or tables here...",
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["blockquote", "code-block"],
          ["link", "clean"]
        ]
      }
    });
  }

  function getEditorContent() {
    if (quillInstance) {
      return quillInstance.root.innerHTML.trim();
    }
    const txtArea = document.getElementById("main-body");
    return txtArea ? txtArea.value.trim() : "";
  }

  function setEditorContent(text) {
    if (quillInstance) {
      quillInstance.root.innerHTML = text || "";
    }
    const txtArea = document.getElementById("main-body");
    if (txtArea) {
      txtArea.value = text || "";
    }
  }

  // Render the recent news list dynamically from StocksDataStore
  function renderNewsList() {
    if (!newsListContainer) return;

    const allNews = StocksDataStore.getNews();

    let listHtml = `
      <div class="section-header-row">
        <h2>Published Articles (${allNews.length})</h2>
        <span class="live-status-pill">Live on Website</span>
      </div>
    `;

    if (allNews.length === 0) {
      listHtml += `<div class="empty-state-card"><p>No articles published yet. Click "Publish New News Article" to create your first article!</p></div>`;
    } else {
      listHtml += `<div class="admin-articles-grid">`;
      allNews.forEach(item => {
        listHtml += `
          <div class="admin-article-card" id="card-${item.id}">
            <div class="card-meta">
              <span class="meta-badge">${item.category || "News"}</span>
              <span class="meta-date">${item.published || "Recent"}</span>
            </div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <p class="card-author">By <strong>${escapeHtml(item.author)}</strong></p>
            ${item.synopsis ? `<p class="card-synopsis">${escapeHtml(item.synopsis)}</p>` : ""}
            <div class="card-actions">
              <button class="admin-btn small primary edit-btn" data-id="${item.id}">Edit</button>
              <button class="admin-btn small secondary preview-item-btn" data-id="${item.id}">Preview</button>
              <button class="admin-btn small danger delete-btn" data-id="${item.id}">Delete</button>
            </div>
          </div>
        `;
      });
      listHtml += `</div>`;
    }

    // Keep the heading/container clean
    const existingSection = document.querySelector(".admin-news-cards-wrapper");
    if (existingSection) {
      existingSection.innerHTML = listHtml;
    } else {
      const wrapper = document.createElement("div");
      wrapper.className = "admin-news-cards-wrapper";
      wrapper.innerHTML = listHtml;
      newsListContainer.appendChild(wrapper);
    }

    attachCardHandlers();
  }

  function attachCardHandlers() {
    // Edit buttons
    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        openEditForm(id);
      });
    });

    // Delete buttons
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        const article = StocksDataStore.getNewsById(id);
        const confirmMsg = article ? `Delete "${article.title}"? This will immediately remove it from the live website.` : "Delete this article?";
        if (confirm(confirmMsg)) {
          StocksDataStore.deleteNews(id);
          renderNewsList();
          showNotification("Article deleted successfully.", "warning");
        }
      });
    });

    // Preview individual item buttons
    document.querySelectorAll(".preview-item-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        const article = StocksDataStore.getNewsById(id);
        if (article) {
          sessionStorage.setItem("stocks360_preview_data", JSON.stringify(article));
          window.open("admin-preview.html", "_blank");
        }
      });
    });
  }

  function openEditForm(id) {
    const article = StocksDataStore.getNewsById(id);
    if (!article) return;

    editingArticleId = id;
    publishFormSection.hidden = false;
    publishNewBtn.hidden = true;

    // Fill form
    headingInput.value = article.title;
    writerInput.value = article.author;
    if (synopsisInput) synopsisInput.value = article.synopsis || "";
    setEditorContent(article.content);
    if (glossaryInput) glossaryInput.value = article.glossary || "";
    if (keywordsInput) keywordsInput.value = article.keywords || "";

    const formHeading = publishFormSection.querySelector("h2");
    if (formHeading) formHeading.textContent = `Edit Article: ${article.title}`;
    finalPublishBtn.textContent = "Save Changes";

    publishFormSection.scrollIntoView({ behavior: "smooth" });
  }

  // Show publish form
  if (publishNewBtn) {
    publishNewBtn.addEventListener("click", function () {
      editingArticleId = null;
      clearForm();
      const formHeading = publishFormSection.querySelector("h2");
      if (formHeading) formHeading.textContent = "Publish New News Article";
      finalPublishBtn.textContent = "Publish to Live Website";
      publishFormSection.hidden = false;
      publishNewBtn.hidden = true;
      headingInput.focus();
    });
  }

  // Cancel form
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      publishFormSection.hidden = true;
      publishNewBtn.hidden = false;
      editingArticleId = null;
      clearForm();
    });
  }

  // Preview Form Data
  if (previewBtn) {
    previewBtn.addEventListener("click", function () {
      const heading = headingInput.value.trim();
      const writer = writerInput.value.trim();
      const body = getEditorContent();

      if (!heading) {
        alert("Please enter a heading to preview.");
        return;
      }

      const previewPayload = {
        title: heading,
        author: writer || "Stocks 360 Contributor",
        published: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        synopsis: synopsisInput ? synopsisInput.value.trim() : "",
        content: body || "Article content preview...",
        glossary: glossaryInput ? glossaryInput.value.trim() : "",
        keywords: keywordsInput ? keywordsInput.value.trim() : ""
      };

      sessionStorage.setItem("stocks360_preview_data", JSON.stringify(previewPayload));
      window.open("admin-preview.html", "_blank");
    });
  }

  // Publish button (Save or Update)
  if (finalPublishBtn) {
    finalPublishBtn.addEventListener("click", function (e) {
      e.preventDefault();

      const heading = headingInput.value.trim();
      const writer = writerInput.value.trim();
      const body = getEditorContent();
      const synopsis = synopsisInput ? synopsisInput.value.trim() : "";
      const glossary = glossaryInput ? glossaryInput.value.trim() : "";
      const keywords = keywordsInput ? keywordsInput.value.trim() : "";

      if (!heading || !writer || !body || body === "<p><br></p>") {
        alert("Please fill all required fields: News Heading, Writer’s Name, and Main Body.");
        return;
      }

      const articlePayload = {
        id: editingArticleId || undefined,
        title: heading,
        author: writer,
        content: body,
        synopsis: synopsis,
        glossary: glossary,
        keywords: keywords,
        published: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        publishedAt: Date.now()
      };

      StocksDataStore.saveNews(articlePayload);

      showNotification(editingArticleId ? "Article updated successfully!" : "Article published to website!", "success");

      clearForm();
      publishFormSection.hidden = true;
      publishNewBtn.hidden = false;
      editingArticleId = null;

      renderNewsList();
    });
  }

  function clearForm() {
    headingInput.value = "";
    writerInput.value = "";
    if (synopsisInput) synopsisInput.value = "";
    setEditorContent("");
    if (glossaryInput) glossaryInput.value = "";
    if (keywordsInput) keywordsInput.value = "";
  }

  function showNotification(text, type) {
    const banner = document.createElement("div");
    banner.className = `admin-alert-banner ${type || "success"}`;
    banner.textContent = text;
    document.body.prepend(banner);
    setTimeout(() => {
      banner.remove();
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Initial render
  renderNewsList();
});
