// admin-ask.js - Connected to StocksDataStore & Firebase Firestore
document.addEventListener("DOMContentLoaded", function () {
  if (typeof AdminAuth !== "undefined") {
    AdminAuth.protectPage();
  }

  const listContainer = document.getElementById("comments-admin-list");

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderAdminComments() {
    if (!listContainer || typeof StocksDataStore === "undefined") return;
    const allComments = StocksDataStore.getComments();

    if (allComments.length === 0) {
      listContainer.innerHTML = `<div class="admin-article-card"><p style="color:#64748b;">No learner questions or comments submitted yet.</p></div>`;
      return;
    }

    listContainer.innerHTML = "";
    allComments.forEach((cmt) => {
      const card = document.createElement("div");
      card.className = "admin-article-card comment-item";
      card.style.marginBottom = "15px";
      card.innerHTML = `
        <div class="card-meta">
          <span class="meta-badge">${escapeHtml(cmt.badge || "Learner Question")}</span>
          <span class="meta-date">${escapeHtml(cmt.date || "")}</span>
        </div>
        <p class="comment-author"><strong>${escapeHtml(cmt.name || "Learner")}</strong> asked:</p>
        <p class="comment-text" style="font-size: 16px; margin: 8px 0; color: #1e293b;">"${escapeHtml(cmt.text)}"</p>
        ${
          cmt.reply
            ? `<div style="background:#f0fdf4; border-left:4px solid #16a34a; padding:10px; margin:8px 0; border-radius:4px;">
                <strong>Admin Reply:</strong> ${escapeHtml(cmt.reply)}
               </div>`
            : ""
        }
        <div class="reply-container" style="margin-top: 10px;">
          <textarea class="multi-input reply-input" rows="2" placeholder="Write or update mentor reply for ${escapeHtml(cmt.name || "Learner")}...">${escapeHtml(cmt.reply || "")}</textarea>
          <div style="margin-top: 6px; display:flex; gap:8px;">
            <button class="admin-btn small success send-reply-btn" data-id="${cmt.id}">Save &amp; Publish Reply</button>
            <button class="admin-btn small danger delete-comment-btn" data-id="${cmt.id}">Delete</button>
          </div>
        </div>
      `;
      listContainer.appendChild(card);
    });

    listContainer.querySelectorAll(".send-reply-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        const card = this.closest(".comment-item");
        const replyText = card.querySelector(".reply-input").value.trim();
        if (!replyText) {
          alert("Please write a reply first.");
          return;
        }
        const all = StocksDataStore.getComments();
        const target = all.find((c) => c.id === id);
        if (target) {
          target.reply = replyText;
          StocksDataStore.saveComment(target);
          renderAdminComments();
        }
      });
    });

    listContainer.querySelectorAll(".delete-comment-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        if (confirm("Are you sure you want to delete this inquiry/comment?")) {
          StocksDataStore.deleteComment(id);
          renderAdminComments();
        }
      });
    });
  }

  renderAdminComments();

  window.addEventListener("stocks360:sync", function (e) {
    if (e.detail && e.detail.collection === "comments") {
      renderAdminComments();
    }
  });
});
