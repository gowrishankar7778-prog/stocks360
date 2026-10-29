// admin-learn.js - Connected with StocksDataStore and AdminAuth
document.addEventListener("DOMContentLoaded", function () {
  if (typeof AdminAuth !== "undefined") {
    AdminAuth.protectPage();
  }

  const startUnitBtn = document.getElementById("start-unit-btn");
  const unitFormSection = document.getElementById("unit-form-section");
  const cancelUnitBtn = document.getElementById("cancel-unit-btn");
  const publishUnitBtn = document.getElementById("publish-unit-btn");

  const watchUnitSection = document.getElementById("watch-unit-section");
  const watchingUnitTitle = document.getElementById("watching-unit-title");
  const subunitsAdminList = document.getElementById("subunits-admin-list");
  const addSubunitBtn = document.getElementById("add-subunit-btn");
  const closeWatchBtn = document.getElementById("close-watch-btn");

  const subunitFormSection = document.getElementById("subunit-form-section");
  const cancelSubunitBtn = document.getElementById("cancel-subunit-btn");
  const publishSubunitBtn = document.getElementById("publish-subunit-btn");

  const unitNameInput = document.getElementById("unit-name");
  const unitDescInput = document.getElementById("unit-body");

  const subNameInput = document.getElementById("sub-name");
  const subBodyInput = document.getElementById("sub-body");
  const subTakeawaysInput = document.getElementById("sub-takeaways");

  let activeViewingUnitId = null;

  function renderUnits() {
    const units = StocksDataStore.getUnits();
    const tableBody = document.querySelector(".admin-table tbody");
    if (!tableBody) return;

    tableBody.innerHTML = "";

    units.forEach((u, index) => {
      const subCount = u.subunits ? u.subunits.length : 0;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>Unit ${index + 1}</strong></td>
        <td>
          <div style="font-weight:600; font-size:16px;">${escapeHtml(u.title)}</div>
          <div style="font-size:13px; color:#64748b;">${escapeHtml(u.description || "")}</div>
        </td>
        <td><span class="meta-badge">${subCount} Lesson${subCount === 1 ? "" : "s"}</span></td>
        <td>
          <button class="admin-btn small primary watch-unit-btn" data-id="${u.id}">Manage Lessons</button>
          <button class="admin-btn small danger delete-unit-btn" data-id="${u.id}">Delete</button>
        </td>
      `;
      tableBody.appendChild(row);
    });

    // Attach listeners
    tableBody.querySelectorAll(".watch-unit-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        openUnitManager(id);
      });
    });

    tableBody.querySelectorAll(".delete-unit-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        if (confirm("Delete this entire learning unit and its lessons?")) {
          StocksDataStore.deleteUnit(id);
          renderUnits();
          if (activeViewingUnitId === id && watchUnitSection) {
            watchUnitSection.hidden = true;
          }
        }
      });
    });
  }

  function openUnitManager(unitId) {
    activeViewingUnitId = unitId;
    const unit = StocksDataStore.getUnitById(unitId);
    if (!unit) return;

    if (watchUnitSection) {
      watchUnitSection.hidden = false;
      if (watchingUnitTitle) watchingUnitTitle.textContent = unit.title;
      renderSubunits(unit);
      watchUnitSection.scrollIntoView({ behavior: "smooth" });
    }
  }

  function renderSubunits(unit) {
    if (!subunitsAdminList) return;
    subunitsAdminList.innerHTML = "";

    const lessons = unit.subunits || [];
    if (lessons.length === 0) {
      subunitsAdminList.innerHTML = `<p style="padding:15px; color:#64748b;">No lessons added to this unit yet. Click "Add New Lesson" below.</p>`;
      return;
    }

    lessons.forEach((s, idx) => {
      const card = document.createElement("div");
      card.className = "admin-article-card";
      card.style.marginBottom = "12px";
      card.innerHTML = `
        <div style="font-weight:600; font-size:16px;">${escapeHtml(s.title)}</div>
        <p style="font-size:14px; color:#475569; margin:6px 0;">${escapeHtml(s.body)}</p>
        ${s.takeaways ? `<p style="font-size:13px; color:#0f766e; background:#f0fdfa; padding:6px 10px; border-radius:4px;"><strong>Takeaways:</strong> ${escapeHtml(s.takeaways)}</p>` : ""}
      `;
      subunitsAdminList.appendChild(card);
    });
  }

  if (startUnitBtn) {
    startUnitBtn.addEventListener("click", function () {
      unitFormSection.hidden = false;
      startUnitBtn.hidden = true;
      if (unitNameInput) unitNameInput.focus();
    });
  }

  if (cancelUnitBtn) {
    cancelUnitBtn.addEventListener("click", function () {
      unitFormSection.hidden = true;
      startUnitBtn.hidden = false;
    });
  }

  if (publishUnitBtn) {
    publishUnitBtn.addEventListener("click", function () {
      const title = unitNameInput.value.trim();
      const desc = unitDescInput.value.trim();

      if (!title) {
        alert("Please enter a unit title.");
        return;
      }

      StocksDataStore.saveUnit({
        title: title,
        description: desc,
        subunits: []
      });

      alert("New unit created successfully!");
      unitNameInput.value = "";
      unitDescInput.value = "";
      unitFormSection.hidden = true;
      startUnitBtn.hidden = false;
      renderUnits();
    });
  }

  if (closeWatchBtn) {
    closeWatchBtn.addEventListener("click", function () {
      if (watchUnitSection) watchUnitSection.hidden = true;
      activeViewingUnitId = null;
    });
  }

  if (addSubunitBtn) {
    addSubunitBtn.addEventListener("click", function () {
      if (subunitFormSection) {
        subunitFormSection.hidden = false;
        addSubunitBtn.hidden = true;
        if (subNameInput) subNameInput.focus();
      }
    });
  }

  if (cancelSubunitBtn) {
    cancelSubunitBtn.addEventListener("click", function () {
      if (subunitFormSection) subunitFormSection.hidden = true;
      if (addSubunitBtn) addSubunitBtn.hidden = false;
    });
  }

  if (publishSubunitBtn) {
    publishSubunitBtn.addEventListener("click", function () {
      if (!activeViewingUnitId) return;

      const title = subNameInput.value.trim();
      const body = subBodyInput.value.trim();
      const takeaways = subTakeawaysInput ? subTakeawaysInput.value.trim() : "";

      if (!title || !body) {
        alert("Please provide both lesson title and body content.");
        return;
      }

      StocksDataStore.saveSubunit(activeViewingUnitId, {
        title: title,
        body: body,
        takeaways: takeaways
      });

      alert("Lesson added to unit successfully!");
      subNameInput.value = "";
      subBodyInput.value = "";
      if (subTakeawaysInput) subTakeawaysInput.value = "";
      if (subunitFormSection) subunitFormSection.hidden = true;
      if (addSubunitBtn) addSubunitBtn.hidden = false;

      const unit = StocksDataStore.getUnitById(activeViewingUnitId);
      renderSubunits(unit);
      renderUnits();
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  renderUnits();
});
