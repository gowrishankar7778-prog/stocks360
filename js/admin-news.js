// admin-news.js - Connected with StocksDataStore, StocksAudioEngine, and AdminAuth
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
  const glossaryInput = document.getElementById("glossary");
  const keywordsInput = document.getElementById("keywords");
  const voiceProfileSelect = document.getElementById("voice-profile-select");
  const customMp3Upload = document.getElementById("custom-mp3-upload");
  const audioStatusText = document.getElementById("admin-audio-compression-status");

  // Track if we are editing an existing article & any pending compressed MP3 payload
  let editingArticleId = null;
  let pendingCompressedMp3 = null;

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

  // Handle custom audio file upload & client-side 32kbps Mono MP3 compression
  if (customMp3Upload && typeof StocksAudioEngine !== "undefined") {
    customMp3Upload.addEventListener("change", async function () {
      const file = this.files && this.files[0];
      if (!file) {
        pendingCompressedMp3 = null;
        return;
      }
      const originalKb = (file.size / 1024).toFixed(1);
      if (audioStatusText) {
        audioStatusText.style.color = "#0284c7";
        audioStatusText.textContent = `Compressing "${file.name}" (${originalKb} KB) into 32kbps Mono MP3 for Firestore...`;
      }
      try {
        const compressed = await StocksAudioEngine.compressAudioBlobToMp3(file, 32);
        pendingCompressedMp3 = compressed;
        if (audioStatusText) {
          audioStatusText.style.color = "#15803d";
          audioStatusText.textContent = `✓ Compressed MP3 Ready: ${compressed.sizeKb} KB (reduced from ${originalKb} KB • ~${compressed.durationSec}s duration) — ready for Firestore!`;
        }
      } catch (err) {
        console.warn("Audio compression error:", err);
        if (audioStatusText) {
          audioStatusText.style.color = "#dc2626";
          audioStatusText.textContent = `Could not compress uploaded file (${err.message}). Defaulting to automatic Google Cloud Voice MP3.`;
        }
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
    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        openEditForm(id);
      });
    });

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
    pendingCompressedMp3 = null;
    publishFormSection.hidden = false;
    publishNewBtn.hidden = true;

    headingInput.value = article.title;
    writerInput.value = article.author;
    if (synopsisInput) synopsisInput.value = article.synopsis || "";
    setEditorContent(article.content);
    if (glossaryInput) glossaryInput.value = article.glossary || "";
    if (keywordsInput) keywordsInput.value = article.keywords || "";
    if (voiceProfileSelect) voiceProfileSelect.value = article.audioVoiceLang || "en-IN";

    const formHeading = publishFormSection.querySelector("h2");
    if (formHeading) formHeading.textContent = `Edit Article: ${article.title}`;
    finalPublishBtn.textContent = "Save Changes";

    publishFormSection.scrollIntoView({ behavior: "smooth" });
  }

  if (publishNewBtn) {
    publishNewBtn.addEventListener("click", function () {
      editingArticleId = null;
      pendingCompressedMp3 = null;
      clearForm();
      const formHeading = publishFormSection.querySelector("h2");
      if (formHeading) formHeading.textContent = "Publish New News Article";
      finalPublishBtn.textContent = "Publish to Live Website";
      publishFormSection.hidden = false;
      publishNewBtn.hidden = true;
      headingInput.focus();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      publishFormSection.hidden = true;
      publishNewBtn.hidden = false;
      editingArticleId = null;
      pendingCompressedMp3 = null;
      clearForm();
    });
  }

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
        keywords: keywordsInput ? keywordsInput.value.trim() : "",
        audioVoiceLang: voiceProfileSelect ? voiceProfileSelect.value : "en-IN"
      };

      sessionStorage.setItem("stocks360_preview_data", JSON.stringify(previewPayload));
      window.open("admin-preview.html", "_blank");
    });
  }

  if (finalPublishBtn) {
    finalPublishBtn.addEventListener("click", async function (e) {
      e.preventDefault();

      const heading = headingInput.value.trim();
      const writer = writerInput.value.trim();
      const body = getEditorContent();
      const synopsis = synopsisInput ? synopsisInput.value.trim() : "";
      const glossary = glossaryInput ? glossaryInput.value.trim() : "";
      const keywords = keywordsInput ? keywordsInput.value.trim() : "";
      const voiceLang = voiceProfileSelect ? voiceProfileSelect.value : "en-IN";

      if (!heading || !writer || !body || body === "<p><br></p>") {
        alert("Please fill all required fields: News Heading, Writer’s Name, and Main Body.");
        return;
      }

      finalPublishBtn.disabled = true;
      finalPublishBtn.textContent = "Compressing MP3 & Publishing...";

      const existingArticle = editingArticleId ? StocksDataStore.getNewsById(editingArticleId) : null;
      const articlePayload = {
        id: editingArticleId || "news-" + Date.now(),
        title: heading,
        author: writer,
        content: body,
        synopsis: synopsis,
        glossary: glossary,
        keywords: keywords,
        published: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        publishedAt: Date.now(),
        audioUrl: existingArticle && existingArticle.audioUrl ? existingArticle.audioUrl : "",
        audioVoiceLang: voiceLang,
        hasCompressedAudio: true
      };

      // If no custom MP3 was uploaded, try synthesizing & compressing via Cloud TTS API if enabled
      if (!pendingCompressedMp3 && typeof StocksAudioEngine !== "undefined") {
        const narrationScript = StocksAudioEngine.buildNarrationScript(articlePayload);
        const synthesized = await StocksAudioEngine.synthesizeCloudTtsMp3(narrationScript, {
          lang: voiceLang,
          name: voiceLang === "en-GB" ? "en-GB-Neural2-A" : voiceLang === "en-US" ? "en-US-Journey-F" : "en-IN-Neural2-A"
        });
        if (synthesized) {
          pendingCompressedMp3 = synthesized;
        }
      }

      if (pendingCompressedMp3 && typeof StocksAudioEngine !== "undefined") {
        articlePayload.audioSizeKb = pendingCompressedMp3.sizeKb;
        await StocksAudioEngine.saveArticleAudioToFirestore(articlePayload.id, {
          dataUrl: pendingCompressedMp3.dataUrl,
          sizeKb: pendingCompressedMp3.sizeKb,
          voice: voiceLang
        });
      }

      const wasEditing = Boolean(editingArticleId);
      StocksDataStore.saveNews(articlePayload);

      finalPublishBtn.disabled = false;
      finalPublishBtn.textContent = "Publish to Live Website";
      showNotification(
        wasEditing
          ? "Article updated successfully!"
          : "Article published to website!",
        "success"
      );

      clearForm();
      publishFormSection.hidden = true;
      publishNewBtn.hidden = false;
      editingArticleId = null;
      pendingCompressedMp3 = null;

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
    if (voiceProfileSelect) voiceProfileSelect.value = "en-IN";
    if (customMp3Upload) customMp3Upload.value = "";
    if (audioStatusText) {
      audioStatusText.style.color = "#15803d";
      audioStatusText.textContent = "✓ Ready: Pleasant Google Cloud Voice MP3 will be attached automatically on publish.";
    }
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

  renderNewsList();
});
