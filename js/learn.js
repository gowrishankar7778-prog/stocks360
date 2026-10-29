// learn.js - Connected with StocksDataStore for live public curriculum
document.addEventListener("DOMContentLoaded", function () {
  let currentUnitId = null;
  let currentSubIndex = 0;

  const unitsList = document.getElementById("units-list");
  const subunitsList = document.getElementById("subunits-list");
  const unitTitle = document.getElementById("unit-title");
  const subunitsUl = document.getElementById("subunits-ul");
  const backToUnits = document.getElementById("back-to-units");

  const subunitDetail = document.getElementById("subunit-detail");
  const subunitTitle = document.getElementById("subunit-title");
  const subunitBody = document.getElementById("subunit-body");
  const subunitTakeaways = document.getElementById("subunit-takeaways");
  const backToSubunits = document.getElementById("back-to-subunits");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  const ask360Btn = document.getElementById("learn-ask360-btn");
  const ask360Box = document.getElementById("learn-ask360-box");
  const ask360Input = document.getElementById("learn-ask360-input");
  const ask360Send = document.getElementById("learn-ask360-send");
  const ask360Response = document.getElementById("learn-ask360-response");

  const commentsList = document.getElementById("comments-list");
  const commentName = document.getElementById("comment-name");
  const commentInput = document.getElementById("comment-input");
  const postCommentBtn = document.getElementById("post-comment-btn");

  function getUnits() {
    return typeof StocksDataStore !== "undefined" ? StocksDataStore.getUnits() : [];
  }

  function renderUnitsList() {
    const units = getUnits();
    const ul = document.getElementById("units-ul") || unitsList.querySelector("ul");
    if (!ul) return;

    ul.innerHTML = "";
    if (units.length === 0) {
      ul.innerHTML = `<li style="padding:20px; text-align:center; color:#64748b;">No learning modules published yet.</li>`;
      return;
    }

    units.forEach((u, idx) => {
      const li = document.createElement("li");
      li.className = "unit-card-item";
      const lessonCount = u.subunits ? u.subunits.length : 0;
      li.innerHTML = `
        <div class="unit-card">
          <div class="unit-badge">Module ${idx + 1}</div>
          <h2><a href="#" class="unit-link" data-unit-id="${u.id}">${escapeHtml(u.title)}</a></h2>
          <p class="unit-desc">${escapeHtml(u.description || "Foundational concepts for stock market learners.")}</p>
          <div class="unit-footer">
            <span class="lesson-count-badge">${lessonCount} Interactive Lesson${lessonCount === 1 ? "" : "s"}</span>
            <a href="#" class="start-unit-link" data-unit-id="${u.id}">Start Module &rarr;</a>
          </div>
        </div>
      `;
      ul.appendChild(li);
    });

    ul.querySelectorAll("[data-unit-id]").forEach(link => {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const id = this.getAttribute("data-unit-id");
        history.pushState({ view: "subunits", unitId: id }, "", "#unit-" + id);
        showSubunits(id);
      });
    });
  }

  function showUnits() {
    subunitsList.hidden = true;
    subunitDetail.hidden = true;
    unitsList.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showSubunits(unitId) {
    currentUnitId = unitId;
    const units = getUnits();
    const unit = units.find(u => u.id === unitId);
    if (!unit) return;

    unitTitle.textContent = unit.title;
    subunitsUl.innerHTML = "";

    const lessons = unit.subunits || [];
    if (lessons.length === 0) {
      subunitsUl.innerHTML = `<li style="padding:15px; color:#64748b;">No lessons added to this unit yet.</li>`;
    } else {
      lessons.forEach(function (su, index) {
        const li = document.createElement("li");
        li.className = "lesson-list-item";
        li.innerHTML = `
          <a href="#" class="lesson-heading-link">
            <span class="lesson-num">${index + 1}</span>
            <span class="lesson-name">${escapeHtml(su.title)}</span>
          </a>
        `;
        li.querySelector("a").addEventListener("click", function (ev) {
          ev.preventDefault();
          history.pushState({ view: "subunit", unitId: unitId, index: index }, "", "#su-" + su.id);
          showSubunit(index);
        });
        subunitsUl.appendChild(li);
      });
    }

    unitsList.hidden = true;
    subunitDetail.hidden = true;
    subunitsList.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showSubunit(index) {
    const units = getUnits();
    const unit = units.find(u => u.id === currentUnitId);
    if (!unit || !unit.subunits || !unit.subunits[index]) return;

    currentSubIndex = index;
    const su = unit.subunits[index];

    subunitTitle.textContent = su.title;
    subunitBody.textContent = su.body;

    if (su.takeaways && su.takeaways.trim() !== "") {
      subunitTakeaways.innerHTML = "<strong>Key Takeaways:</strong><br>" + escapeHtml(su.takeaways);
      subunitTakeaways.hidden = false;
    } else {
      subunitTakeaways.hidden = true;
    }

    // Previous / Next button visibility
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === unit.subunits.length - 1;

    // Reset ask360
    if (ask360Box) {
      ask360Box.hidden = true;
      if (ask360Btn) ask360Btn.setAttribute("aria-expanded", "false");
      if (ask360Input) ask360Input.value = "";
      if (ask360Response) ask360Response.innerHTML = "";
    }

    // Load comments
    loadComments(su.id);

    subunitsList.hidden = true;
    unitsList.hidden = true;
    subunitDetail.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    subunitTitle.focus();

    if (typeof window.speakWithPitch === "function") {
      window.speakWithPitch(su.title, true);
    }
  }

  function loadComments(lessonId) {
    if (!commentsList) return;
    try {
      const saved = JSON.parse(localStorage.getItem("stocks360_comments_" + lessonId) || "[]");
      if (saved.length === 0) {
        commentsList.innerHTML = `<p style="color:#64748b; font-style:italic;">No questions posted yet. Be the first learner to ask a question!</p>`;
      } else {
        commentsList.innerHTML = "";
        saved.forEach(c => {
          const div = document.createElement("div");
          div.className = "learner-comment-card";
          div.innerHTML = `
            <div class="comment-author-name"><strong>${escapeHtml(c.name)}</strong> <span class="comment-time">${escapeHtml(c.date)}</span></div>
            <p class="comment-body">${escapeHtml(c.text)}</p>
          `;
          commentsList.appendChild(div);
        });
      }
    } catch (e) {
      commentsList.innerHTML = "<p>No comments yet.</p>";
    }
  }

  if (postCommentBtn) {
    postCommentBtn.addEventListener("click", function () {
      const name = commentName ? commentName.value.trim() : "Anonymous Learner";
      const text = commentInput ? commentInput.value.trim() : "";

      if (!text) {
        alert("Please write your question or thought before submitting.");
        return;
      }

      const units = getUnits();
      const unit = units.find(u => u.id === currentUnitId);
      const lesson = unit && unit.subunits ? unit.subunits[currentSubIndex] : null;
      const lessonId = lesson ? lesson.id : "general";

      try {
        const key = "stocks360_comments_" + lessonId;
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        existing.unshift({
          name: name || "Learner",
          text: text,
          date: new Date().toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
        });
        localStorage.setItem(key, JSON.stringify(existing));
        loadComments(lessonId);
        if (commentInput) commentInput.value = "";
      } catch (e) {
        alert("Comment saved for this session.");
      }
    });
  }

  if (backToUnits) {
    backToUnits.addEventListener("click", function (e) {
      e.preventDefault();
      history.pushState({ view: "units" }, "", "learn.html");
      showUnits();
    });
  }

  if (backToSubunits) {
    backToSubunits.addEventListener("click", function (e) {
      e.preventDefault();
      history.pushState({ view: "subunits", unitId: currentUnitId }, "", "#unit-" + currentUnitId);
      showSubunits(currentUnitId);
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      if (currentSubIndex > 0) {
        showSubunit(currentSubIndex - 1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      const units = getUnits();
      const unit = units.find(u => u.id === currentUnitId);
      if (unit && unit.subunits && currentSubIndex < unit.subunits.length - 1) {
        showSubunit(currentSubIndex + 1);
      }
    });
  }

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
          <p style="margin-top:6px; color:#1e40af;">In this learning unit, remember that market concepts operate on strict regulatory and mathematical principles. Try re-reading the Key Takeaways box above.</p>
        </div>
      `;
      ask360Input.value = "";
    });
  }

  window.addEventListener("popstate", function (e) {
    if (e.state) {
      if (e.state.view === "subunit") {
        currentUnitId = e.state.unitId;
        showSubunit(e.state.index);
      } else if (e.state.view === "subunits") {
        showSubunits(e.state.unitId);
      } else {
        showUnits();
      }
    } else {
      showUnits();
    }
  });

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  renderUnitsList();
});
