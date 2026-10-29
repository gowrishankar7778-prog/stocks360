// admin-menu.js
// Handles the Menu dropdown under each news/newsletter item

document.addEventListener("DOMContentLoaded", function () {
  const menuToggles = document.querySelectorAll(".menu-toggle");

  menuToggles.forEach(function (toggle) {
    toggle.addEventListener("click", function () {
      const menu = toggle.nextElementSibling;
      const isHidden = menu.hidden;

      // Close all other open menus first
      document.querySelectorAll(".menu-options").forEach(function (m) {
        m.hidden = true;
      });
      document.querySelectorAll(".menu-toggle").forEach(function (t) {
        t.setAttribute("aria-expanded", "false");
      });

      if (isHidden) {
        menu.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
      }
    });
  });

  // Close menu when clicking outside
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".news-menu")) {
      document.querySelectorAll(".menu-options").forEach(function (m) {
        m.hidden = true;
      });
      document.querySelectorAll(".menu-toggle").forEach(function (t) {
        t.setAttribute("aria-expanded", "false");
      });
    }
  });
});
