// admin-login.js
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("admin-login-form");
  const message = document.getElementById("login-message");

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const email = document.getElementById("admin-email").value.trim();
      const password = document.getElementById("admin-password").value.trim();

      // Temporary simple check (later we will use Firebase Authentication)
      if (email && password) {
        // For now, any email + password will work for testing
        message.textContent = "Login successful! Redirecting...";
        message.style.color = "green";

        setTimeout(function () {
          window.location.href = "news.html";
        }, 800);
      } else {
        message.textContent = "Please enter email and password.";
        message.style.color = "red";
      }
    });
  }
});
