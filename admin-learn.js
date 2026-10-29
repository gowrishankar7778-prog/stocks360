// admin-learn.js
document.addEventListener("DOMContentLoaded", function () {
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

  // Sample sub-units data
  const subUnitsData = {
    "unit-1": [
      { title: "1. Why Stock Market?", id: "su-1" },
      { title: "2. The Regulators of the Stock Market", id: "su-2" }
    ],
    "unit-2": [
      { title: "1. Who are the Investors?", id: "su-3" }
    ]
  };

  // Start New Unit
  if (startUnitBtn) {
    startUnitBtn.addEventListener("click", function () {
      unitFormSection.hidden = false;
      startUnitBtn.hidden = true;
      document.getElementById("unit-name").focus();
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
      const name = document.getElementById("unit-name").value.trim();
      const body = document.getElementById("unit-body").value.trim();
      if (!name || !body) {
        alert("Please fill Unit Name and Body.");
        return;
      }
      alert("Unit published successfully! (Temporary message)");
      unitFormSection.hidden = true;
      startUnitBtn.hidden = false;
    });
  }

  // Watch Unit buttons
  document.querySelectorAll(".watch-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const unitId = btn.getAttribute("data-unit");
      const unitName = btn.closest(".admin-news-item").querySelector(".admin-news-link").textContent;

      watchingUnitTitle.textContent = "Sub-units of: " + unitName;
      subunitsAdminList.innerHTML = "";

      const subs = subUnitsData[unitId] || [];
      if (subs.length === 0) {
        subunitsAdminList.innerHTML = "<p>No sub-units created yet.</p>";
      } else {
        subs.forEach(function (su) {
          const div = document.createElement("div");
          div.className = "admin-news-item";
          div.innerHTML = `
            <a href="#" class="admin-news-link">${su.title}</a>
            <div class="news-menu">
              <button class="menu-toggle" aria-expanded="false" aria-haspopup="true">Menu</button>
              <ul class="menu-options" hidden>
                <li><label><input type="checkbox"> Keep it private</label></li>
                <li><button class="menu-action edit-btn">Edit</button></li>
                <li><button class="menu-action delete-btn">Delete</button></li>
              </ul>
            </div>
          `;
          subunitsAdminList.appendChild(div);
        });
        // Re-bind menu toggles for new elements
        if (typeof window.bindMenuToggles === "function") {
          window.bindMenuToggles();
        }
      }

      watchUnitSection.hidden = false;
      unitFormSection.hidden = true;
    });
  });

  if (closeWatchBtn) {
    closeWatchBtn.addEventListener("click", function () {
      watchUnitSection.hidden = true;
    });
  }

  // Add Sub-unit
  if (addSubunitBtn) {
    addSubunitBtn.addEventListener("click", function () {
      subunitFormSection.hidden = false;
      document.getElementById("subunit-name").focus();
    });
  }

  if (cancelSubunitBtn) {
    cancelSubunitBtn.addEventListener("click", function () {
      subunitFormSection.hidden = true;
    });
  }

  if (publishSubunitBtn) {
    publishSubunitBtn.addEventListener("click", function () {
      const name = document.getElementById("subunit-name").value.trim();
      const body = document.getElementById("subunit-body").value.trim();
      if (!name || !body) {
        alert("Please fill Sub-unit Title and Body.");
        return;
      }
      alert("Sub-unit published successfully! (Temporary message)");
      subunitFormSection.hidden = true;
    });
  }
});
