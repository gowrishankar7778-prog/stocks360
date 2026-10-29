/**
 * Stocks 360 - Admin Authentication & Authorization (admin-auth.js)
 * Manages admin credentials, active sessions, and route protection.
 */

const AdminAuth = (function () {
  const STORAGE_KEYS = {
    CREDS: "stocks360_admin_credentials",
    SESSION: "stocks360_admin_session"
  };

  // Default credentials
  const DEFAULT_CREDS = [
    {
      email: "admin@stocks360.com",
      passwordHash: btoa("Stocks360@Admin"), // Simple reversible hash for client-side demo
      role: "Super Admin",
      name: "Admin"
    },
    {
      email: "gowrishankar7778@gmail.com",
      passwordHash: btoa("Stocks360@Admin"),
      role: "Founder / Super Admin",
      name: "Gowrishankar"
    }
  ];

  // Helper to get stored credentials
  function getCredentials() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CREDS);
      return data ? JSON.parse(data) : DEFAULT_CREDS;
    } catch (e) {
      return DEFAULT_CREDS;
    }
  }

  function saveCredentials(creds) {
    try {
      localStorage.setItem(STORAGE_KEYS.CREDS, JSON.stringify(creds));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Initialize default credentials
  if (!localStorage.getItem(STORAGE_KEYS.CREDS)) {
    saveCredentials(DEFAULT_CREDS);
  }

  return {
    /**
     * Authenticate admin with email and password
     */
    login: function (email, password, rememberMe) {
      const trimmedEmail = (email || "").trim().toLowerCase();
      const creds = getCredentials();
      const user = creds.find(c => c.email.toLowerCase() === trimmedEmail);

      if (!user) {
        return { success: false, message: "Invalid email address." };
      }

      if (user.passwordHash !== btoa(password)) {
        return { success: false, message: "Incorrect password." };
      }

      const sessionData = {
        email: user.email,
        name: user.name,
        role: user.role,
        loggedInAt: Date.now()
      };

      if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
      } else {
        sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
      }

      return { success: true, user: sessionData };
    },

    /**
     * Check if current session is authenticated
     */
    isAuthenticated: function () {
      try {
        const session = sessionStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem(STORAGE_KEYS.SESSION);
        if (!session) return false;
        const parsed = JSON.parse(session);
        return Boolean(parsed && parsed.email);
      } catch (e) {
        return false;
      }
    },

    /**
     * Get current logged in admin user
     */
    getCurrentUser: function () {
      try {
        const session = sessionStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem(STORAGE_KEYS.SESSION);
        return session ? JSON.parse(session) : null;
      } catch (e) {
        return null;
      }
    },

    /**
     * Change admin password
     */
    changePassword: function (email, currentPassword, newPassword) {
      const creds = getCredentials();
      const userIdx = creds.findIndex(c => c.email.toLowerCase() === email.trim().toLowerCase());

      if (userIdx === -1) {
        return { success: false, message: "User not found." };
      }

      if (creds[userIdx].passwordHash !== btoa(currentPassword)) {
        return { success: false, message: "Current password does not match." };
      }

      if (!newPassword || newPassword.length < 6) {
        return { success: false, message: "New password must be at least 6 characters long." };
      }

      creds[userIdx].passwordHash = btoa(newPassword);
      saveCredentials(creds);
      return { success: true, message: "Password updated successfully!" };
    },

    /**
     * Logout admin and redirect to login
     */
    logout: function () {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION);
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      window.location.href = "admin-login.html";
    },

    /**
     * Route protection guard - call this on all admin-*.html pages
     */
    protectPage: function () {
      // If we are on admin-login.html, do not protect
      const currentPage = window.location.pathname.split("/").pop();
      if (currentPage === "admin-login.html" || currentPage === "login.html") {
        // If already logged in, redirect directly to admin-news
        if (this.isAuthenticated()) {
          window.location.href = "admin-news.html";
        }
        return;
      }

      if (!this.isAuthenticated()) {
        const redirectUrl = encodeURIComponent(window.location.href);
        window.location.href = "admin-login.html?unauthorized=true&redirect=" + redirectUrl;
      } else {
        // Automatically attach header details once DOM is loaded
        document.addEventListener("DOMContentLoaded", function () {
          AdminAuth.renderAdminHeader();
        });
      }
    },

    /**
     * Render logged in status and hook up logout button
     */
    renderAdminHeader: function () {
      const user = this.getCurrentUser();
      const headerRight = document.querySelector(".admin-header .container p");
      if (headerRight && user) {
        headerRight.innerHTML = `Logged in as <strong>${user.name}</strong> (${user.email}) | <a href="#" id="admin-logout-link" style="color:#60a5fa; text-decoration:underline; margin-left:8px;">Logout</a>`;
        
        const logoutLink = document.getElementById("admin-logout-link");
        if (logoutLink) {
          logoutLink.addEventListener("click", function (e) {
            e.preventDefault();
            if (confirm("Are you sure you want to log out of Stocks 360 Admin?")) {
              AdminAuth.logout();
            }
          });
        }
      }
    }
  };
})();

// Attach to window
if (typeof window !== "undefined") {
  window.AdminAuth = AdminAuth;
}
