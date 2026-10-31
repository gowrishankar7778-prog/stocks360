// admin-login.js - Connected with Firebase Authentication & AdminAuth
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("admin-login-form");
  const message = document.getElementById("login-message");
  const emailInput = document.getElementById("admin-email");
  const passwordInput = document.getElementById("admin-password");
  const rememberCheckbox = document.getElementById("admin-remember");
  const googleLoginBtn = document.getElementById("google-admin-login-btn");

  const urlParams = new URLSearchParams(window.location.search);

  function showMessage(text, type) {
    if (!message) return;
    message.textContent = text;
    message.style.padding = "10px";
    message.style.borderRadius = "6px";
    if (type === "error") {
      message.style.color = "#dc2626";
      message.style.backgroundColor = "#fef2f2";
      message.style.border = "1px solid #fecaca";
    } else if (type === "success") {
      message.style.color = "#16a34a";
      message.style.backgroundColor = "#f0fdf4";
      message.style.border = "1px solid #bbf7d0";
    } else {
      message.style.color = "#d97706";
      message.style.backgroundColor = "#fffbeb";
      message.style.border = "1px solid #fde68a";
    }
  }

  if (urlParams.get("unauthorized") === "true") {
    showMessage("Restricted area. Please sign in with your Stocks 360 Admin account.", "warn");
  }

  // Toggle password visibility
  const togglePassBtn = document.getElementById("toggle-password-btn");
  if (togglePassBtn) {
    togglePassBtn.addEventListener("click", function () {
      const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
      passwordInput.setAttribute("type", type);
      togglePassBtn.textContent = type === "password" ? "Show" : "Hide";
      togglePassBtn.setAttribute("aria-label", type === "password" ? "Show password" : "Hide password");
    });
  }

  // Google Sign-In handler
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", async function () {
      const remember = rememberCheckbox ? rememberCheckbox.checked : true;
      showMessage("Opening Google Sign-In for Admin verification...", "warn");
      const result = await AdminAuth.loginWithGoogle(remember);
      if (result.success) {
        showMessage("Verified! Redirecting to Stocks 360 Admin Panel...", "success");
        const redirect = urlParams.get("redirect");
        const destination = redirect ? decodeURIComponent(redirect) : "admin-news.html";
        setTimeout(function () {
          window.location.href = destination;
        }, 500);
      } else {
        showMessage(result.message || "Google Sign-In failed.", "error");
      }
    });
  }

  // Email/Password Sign-In handler
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      const remember = rememberCheckbox ? rememberCheckbox.checked : true;

      if (!email || !password) {
        showMessage("Please enter both your admin email and password.", "error");
        return;
      }

      showMessage("Verifying admin credentials...", "warn");
      const result = await AdminAuth.loginAsync(email, password, remember);

      if (result.success) {
        showMessage("Authentication successful! Redirecting to Admin Panel...", "success");
        const redirect = urlParams.get("redirect");
        const destination = redirect ? decodeURIComponent(redirect) : "admin-news.html";

        setTimeout(function () {
          window.location.href = destination;
        }, 500);
      } else {
        showMessage(result.message || "Invalid credentials. Please try again.", "error");
      }
    });
  }
});
