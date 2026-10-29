// learn.js
document.addEventListener("DOMContentLoaded", function () {

  const unitsData = {
    "unit-1": {
      title: "Unit 1: Introduction to Stock Markets",
      subunits: [
        {
          id: "su-1",
          title: "1. Why Stock Market?",
          body: "The stock market allows companies to raise money by selling shares to the public. It also gives people a chance to own a small part of companies and benefit from their growth over time.",
          takeaways: "Stock market helps companies raise capital. Investors can become part owners of companies."
        },
        {
          id: "su-2",
          title: "2. The Regulators of the Stock Market",
          body: "In India, SEBI (Securities and Exchange Board of India) is the main regulator of the stock market. It protects investors and ensures fair practices.",
          takeaways: "SEBI regulates the Indian stock market. Regulation helps maintain trust and fairness."
        }
      ]
    },
    "unit-2": {
      title: "Unit 2: Understanding Market Participants",
      subunits: [
        {
          id: "su-3",
          title: "1. Who are the Investors?",
          body: "Investors are individuals or institutions who buy shares with the aim of earning returns over a period of time. They can be retail investors or large institutional investors.",
          takeaways: "There are retail and institutional investors. Different investors have different goals and time horizons."
        }
      ]
    }
  };

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

  function showUnits() {
    subunitsList.hidden = true;
    subunitDetail.hidden = true;
    unitsList.hidden = false;
  }

  function showSubunits(unitId) {
    currentUnitId = unitId;
    const unit = unitsData[unitId];
    if (!unit) return;

    unitTitle.textContent = unit.title;
    subunitsUl.innerHTML = "";

    unit.subunits.forEach(function (su, index) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#";
      a.className = "news-heading-link";
      a.textContent = su.title;
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        history.pushState({ view: "subunit", unitId: unitId, index: index }, "", "#su-" + su.id);
        showSubunit(index);
      });
      li.appendChild(a);
      subunitsUl.appendChild(li);
    });

    unitsList.hidden = true;
    subunitDetail.hidden = true;
    subunitsList.hidden = false;
  }

  function showSubunit(index) {
    const unit = unitsData[currentUnitId];
    if (!unit || !unit.subunits[index]) return;

    currentSubIndex = index;
    const su = unit.subunits[index];

    subunitTitle.textContent = su.title;
    subunitBody.textContent = su.body;

    if (su.takeaways && su.takeaways.trim() !== "") {
      subunitTakeaways.innerHTML = "<strong>Key Takeaways:</strong><br>" + su.takeaways;
      subunitTakeaways.hidden = false;
    } else {
      subunitTakeaways.hidden = true;
    }

    ask360Box.hidden = true;
    ask360Btn.setAttribute("aria-expanded", "false");
    ask360Input.value = "";
    ask360Response.innerHTML = "";
    commentsList.innerHTML = "<p>No comments yet. Be the first to comment.</p>";

    subunitsList.hidden = true;
    unitsList.hidden = true;
    subunitDetail.hidden = false;
    subunitTitle.focus();
  }

  // Unit click
  document.querySelectorAll(".unit-link").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const unitId = link.getAttribute("data-unit-id");
      history.pushState({ view: "subunits", unitId: unitId }, "", "#unit-" + unitId);
      showSubunits(unitId);
    });
  });

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

  // Browser Back / Forward
  window.addEventListener("popstate", function (e) {
    if (!e.state || e.state.view === "units") {
      showUnits();
    } else if (e.state.view === "subunits") {
      showSubunits(e.state.unitId);
    } else if (e.state.view === "subunit") {
      currentUnitId = e.state.unitId;
      showSubunit(e.state.index);
    }
  });

  // Previous / Next
  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      if (currentSubIndex > 0) {
        const newIndex = currentSubIndex - 1;
        history.pushState({ view: "subunit", unitId: currentUnitId, index: newIndex }, "", "#su-" + unitsData[currentUnitId].subunits[newIndex].id);
        showSubunit(newIndex);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      const unit = unitsData[currentUnitId];
      if (unit && currentSubIndex < unit.subunits.length - 1) {
        const newIndex = currentSubIndex + 1;
        history.pushState({ view: "subunit", unitId: currentUnitId, index: newIndex }, "", "#su-" + unit.subunits[newIndex].id);
        showSubunit(newIndex);
      }
    });
  }

  // Ask 360
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

  // Comments
  if (postCommentBtn) {
    postCommentBtn.addEventListener("click", function () {
      const name = commentName ? commentName.value.trim() : "";
      const text = commentInput.value.trim();
      if (text === "") {
        alert("Please write a comment.");
        return;
      }
      const displayName = name !== "" ? name : "Anonymous";
      const p = document.createElement("p");
      p.innerHTML = "<strong>" + displayName + ":</strong> " + text;
      if (commentsList.textContent.includes("No comments yet")) {
        commentsList.innerHTML = "";
      }
      commentsList.appendChild(p);
      commentInput.value = "";
      if (commentName) commentName.value = "";
    });
  }
});
