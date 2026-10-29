// admin-newsletter.js - Connected with StocksDataStore and AdminAuth
document.addEventListener("DOMContentLoaded", function () {
  if (typeof AdminAuth !== "undefined") {
    AdminAuth.protectPage();
  }

  const publishNewBtn = document.getElementById("publish-new-btn");
  const publishFormSection = document.getElementById("publish-form-section");
  const cancelBtn = document.getElementById("cancel-publish-btn");
  const finalPublishBtn = document.getElementById("final-publish-btn");
  const previewBtn = document.getElementById("preview-btn");
  const container = document.querySelector(".recent-news-section") || document.querySelector(".admin-main");

  const headingInput = document.getElementById("news-heading");
  const writerInput = document.getElementById("writer-name");
  const mainBody = document.getElementById("main-body");
  const glossaryInput = document.getElementById("glossary");
  const keywordsInput = document.getElementById("keywords");

  let editingId = null;

  function renderNewsletterList() {
    const list = StocksDataStore.getNewsletters();
    let wrapper = document.getElementById("admin-nl-list-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "admin-nl-list-wrapper";
      container.appendChild(wrapper);
    }

    let html = `
      <div class="section-header-row">
        <h2>Published Newsletters (${list.length})</h2>
        <span class="live-status-pill">Weekly Digest</span>
      </div>
    `;

    if (list.length === 0) {
      html += `<div class="empty-state-card"><p>No newsletters published yet. Click "Publish New Newsletter" to start!</p></div>`;
    } else {
      html += `<div class="admin-articles-grid">`;
      list.forEach(item => {
        html += `
          <div class="admin-article-card" id="nl-card-${item.id}">
            <div class="card-meta">
              <span class="meta-badge">Newsletter</span>
              <span class="meta-date">${item.published || "Weekly"}</span>
            </div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <p class="card-author">By <strong>${escapeHtml(item.author)}</strong></p>
            <p class="card-synopsis">${escapeHtml(item.content.substring(0, 160))}...</p>
            <div class="card-actions">
              <button class="admin-btn small primary edit-nl-btn" data-id="${item.id}">Edit</button>
              <button class="admin-btn small danger delete-nl-btn" data-id="${item.id}">Delete</button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    wrapper.innerHTML = html;

    // Attach click events
    wrapper.querySelectorAll(".edit-nl-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        openEdit(id);
      });
    });

    wrapper.querySelectorAll(".delete-nl-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        if (confirm("Delete this newsletter?")) {
          StocksDataStore.deleteNewsletter(id);
          renderNewsletterList();
        }
      });
    });
  }

  function openEdit(id) {
    const item = StocksDataStore.getNewsletterById(id);
    if (!item) return;

    editingId = id;
    publishFormSection.hidden = false;
    if (publishNewBtn) publishNewBtn.hidden = true;

    headingInput.value = item.title;
    writerInput.value = item.author;
    mainBody.value = item.content;
    if (glossaryInput) glossaryInput.value = item.glossary || "";
    if (keywordsInput) keywordsInput.value = item.keywords || "";

    const formHeading = publishFormSection.querySelector("h2");
    if (formHeading) formHeading.textContent = `Edit Newsletter: ${item.title}`;
    finalPublishBtn.textContent = "Save Changes";
    publishFormSection.scrollIntoView({ behavior: "smooth" });
  }

  if (publishNewBtn) {
    publishNewBtn.addEventListener("click", function () {
      editingId = null;
      clearForm();
      const formHeading = publishFormSection.querySelector("h2");
      if (formHeading) formHeading.textContent = "Publish New Weekly Newsletter";
      finalPublishBtn.textContent = "Publish Newsletter";
      publishFormSection.hidden = false;
      publishNewBtn.hidden = true;
      headingInput.focus();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      publishFormSection.hidden = true;
      if (publishNewBtn) publishNewBtn.hidden = false;
      editingId = null;
      clearForm();
    });
  }

  if (finalPublishBtn) {
    finalPublishBtn.addEventListener("click", function () {
      const heading = headingInput.value.trim();
      const writer = writerInput.value.trim();
      const body = mainBody.value.trim();

      if (!heading || !writer || !body) {
        alert("Please fill required fields: Heading, Writer Name, and Content.");
        return;
      }

      StocksDataStore.saveNewsletter({
        id: editingId || undefined,
        title: heading,
        author: writer,
        content: body,
        glossary: glossaryInput ? glossaryInput.value.trim() : "",
        keywords: keywordsInput ? keywordsInput.value.trim() : "",
        published: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
      });

      alert(editingId ? "Newsletter updated!" : "Newsletter published to website!");
      clearForm();
      publishFormSection.hidden = true;
      if (publishNewBtn) publishNewBtn.hidden = false;
      editingId = null;
      renderNewsletterList();
    });
  }

  function clearForm() {
    headingInput.value = "";
    writerInput.value = "";
    mainBody.value = "";
    if (glossaryInput) glossaryInput.value = "";
    if (keywordsInput) keywordsInput.value = "";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  renderNewsletterList();
});
