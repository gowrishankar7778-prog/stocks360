// admin-login.js - Connected with AdminAuth
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("admin-login-form");
  const message = document.getElementById("login-message");
  const emailInput = document.getElementById("admin-email");
  const passwordInput = document.getElementById("admin-password");
  const rememberCheckbox = document.getElementById("admin-remember");

  // Check URL params for unauthorized message or redirect
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("unauthorized") === "true") {
    message.textContent = "You need admin credentials to view that screen. Please log in.";
    message.style.color = "#d97706"; // Amber
    message.style.backgroundColor = "#fffbeb";
    message.style.padding = "10px";
    message.style.borderRadius = "6px";
    message.style.border = "1px solid #fde68a";
  }

  // Pre-fill demo credentials on button click
  const demoBtn = document.getElementById("fill-demo-creds");
  if (demoBtn) {
    demoBtn.addEventListener("click", function (e) {
      e.preventDefault();
      emailInput.value = "gowrishankar7778@gmail.com";
      passwordInput.value = "Stocks360@Admin";
      message.textContent = "Demo credentials filled! Click 'Login' to proceed.";
      message.style.color = "#0284c7";
      message.style.backgroundColor = "#f0f9ff";
      message.style.padding = "10px";
      message.style.borderRadius = "6px";
      message.style.border = "1px solid #bae6fd";
    });
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

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      const remember = rememberCheckbox ? rememberCheckbox.checked : false;

      if (!email || !password) {
        message.textContent = "Please enter both email and password.";
        message.style.color = "#dc2626";
        message.style.backgroundColor = "#fef2f2";
        message.style.padding = "10px";
        message.style.borderRadius = "6px";
        message.style.border = "1px solid #fecaca";
        return;
      }

      // Authenticate via AdminAuth
      const result = AdminAuth.login(email, password, remember);

      if (result.success) {
        message.textContent = "Authentication successful! Redirecting to Admin Panel...";
        message.style.color = "#16a34a";
        message.style.backgroundColor = "#f0fdf4";
        message.style.padding = "10px";
        message.style.borderRadius = "6px";
        message.style.border = "1px solid #bbf7d0";

        // Determine destination
        const redirect = urlParams.get("redirect");
        const destination = redirect ? decodeURIComponent(redirect) : "admin-news.html";

        setTimeout(function () {
          window.location.href = destination;
        }, 600);
      } else {
        message.textContent = result.message || "Invalid credentials. Please try again.";
        message.style.color = "#dc2626";
        message.style.backgroundColor = "#fef2f2";
        message.style.padding = "10px";
        message.style.borderRadius = "6px";
        message.style.border = "1px solid #fecaca";
      }
    });
  }
});
