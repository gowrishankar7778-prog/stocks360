// admin-settings.js - Settings & Backup Management
document.addEventListener("DOMContentLoaded", function () {
  if (typeof AdminAuth !== "undefined") {
    AdminAuth.protectPage();
  }

  const currentUser = AdminAuth.getCurrentUser();
  const emailDisplay = document.getElementById("current-admin-email");
  if (emailDisplay && currentUser) {
    emailDisplay.textContent = currentUser.email;
  }

  // Password Change Form
  const passForm = document.getElementById("change-password-form");
  const passMsg = document.getElementById("password-feedback");

  if (passForm) {
    passForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const currentPass = document.getElementById("current-password").value;
      const newPass = document.getElementById("new-password").value;
      const confirmPass = document.getElementById("confirm-new-password").value;

      if (newPass !== confirmPass) {
        showFeedback(passMsg, "New passwords do not match.", "error");
        return;
      }

      if (!currentUser) {
        showFeedback(passMsg, "No active session found.", "error");
        return;
      }

      const res = AdminAuth.changePassword(currentUser.email, currentPass, newPass);
      if (res.success) {
        showFeedback(passMsg, res.message, "success");
        passForm.reset();
      } else {
        showFeedback(passMsg, res.message, "error");
      }
    });
  }

  // Backup Export
  const exportBtn = document.getElementById("export-backup-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      const backupData = StocksDataStore.exportBackup();
      const blob = new Blob([backupData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stocks360-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Backup Import
  const importInput = document.getElementById("import-file-input");
  const importBtn = document.getElementById("import-backup-btn");
  const importMsg = document.getElementById("import-feedback");

  if (importBtn && importInput) {
    importBtn.addEventListener("click", function () {
      importInput.click();
    });

    importInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (evt) {
        const content = evt.target.result;
        const res = StocksDataStore.importBackup(content);
        if (res.success) {
          showFeedback(importMsg, "Website database restored successfully! Reloading in 1s...", "success");
          setTimeout(() => location.reload(), 1200);
        } else {
          showFeedback(importMsg, "Import failed: " + res.error, "error");
        }
      };
      reader.readAsText(file);
    });
  }

  // Reset to Default
  const resetBtn = document.getElementById("reset-default-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (confirm("Reset all website articles and lessons back to default demo data?")) {
        StocksDataStore.resetToDefault();
        alert("Website restored to default data. Reloading page.");
        location.reload();
      }
    });
  }

  // Metrics update
  const newsCount = document.getElementById("metric-news-count");
  const nlCount = document.getElementById("metric-nl-count");
  const unitCount = document.getElementById("metric-unit-count");

  if (newsCount) newsCount.textContent = StocksDataStore.getNews().length;
  if (nlCount) nlCount.textContent = StocksDataStore.getNewsletters().length;
  if (unitCount) unitCount.textContent = StocksDataStore.getUnits().length;

  function showFeedback(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.className = `feedback-box ${type}`;
    el.hidden = false;
  }
});
