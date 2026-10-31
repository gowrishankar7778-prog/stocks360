/**
 * Stocks 360 - Admin Authentication & Authorization (admin-auth.js)
 * Connects with Firebase Authentication (Email/Password & Google Sign-In)
 * and enforces strict admin-only route protection.
 */

const AdminAuth = (function () {
  const STORAGE_KEYS = {
    CREDS: "stocks360_admin_credentials",
    SESSION: "stocks360_admin_session"
  };

  // Whitelisted Admin Emails
  const ALLOWED_ADMIN_EMAILS = [
    "gowrishankar7778@gmail.com",
    "admin@stocks360.com"
  ];

  const DEFAULT_CREDS = [
    {
      email: "gowrishankar7778@gmail.com",
      passwordHash: btoa("Stocks360@Admin"),
      role: "Founder / Super Admin",
      name: "Gowrishankar"
    },
    {
      email: "admin@stocks360.com",
      passwordHash: btoa("Stocks360@Admin"),
      role: "Super Admin",
      name: "Admin"
    }
  ];

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

  function storeSession(sessionData, rememberMe) {
    if (rememberMe) {
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
    } else {
      sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
    }
  }

  if (!localStorage.getItem(STORAGE_KEYS.CREDS)) {
    saveCredentials(DEFAULT_CREDS);
  }

  return {
    isAllowedAdminEmail: function (email) {
      if (!email) return false;
      const lower = email.trim().toLowerCase();
      return ALLOWED_ADMIN_EMAILS.includes(lower);
    },

    /**
     * Authenticate admin via Firebase Auth first, with fallback to verified admin credentials
     */
    loginAsync: async function (email, password, rememberMe) {
      const trimmedEmail = (email || "").trim().toLowerCase();
      if (!this.isAllowedAdminEmail(trimmedEmail)) {
        return { success: false, message: "Access denied. This email is not an authorized Stocks 360 Admin." };
      }

      // 1. Try Firebase Auth if initialized
      if (typeof StocksFirebase !== "undefined" && StocksFirebase.getAuth()) {
        try {
          const auth = StocksFirebase.getAuth();
          const persistence = rememberMe
            ? firebase.auth.Auth.Persistence.LOCAL
            : firebase.auth.Auth.Persistence.SESSION;
          await auth.setPersistence(persistence);
          const userCred = await auth.signInWithEmailAndPassword(trimmedEmail, password);
          const fbUser = userCred.user;

          const sessionData = {
            email: fbUser.email,
            name: fbUser.displayName || (trimmedEmail.startsWith("gowri") ? "Gowrishankar" : "Admin"),
            role: "Founder / Super Admin",
            uid: fbUser.uid,
            authProvider: "firebase",
            loggedInAt: Date.now()
          };
          storeSession(sessionData, rememberMe);
          return { success: true, user: sessionData };
        } catch (fbErr) {
          // If Firebase user hasn't been created yet but matches default admin credentials, auto-provision in Firebase Auth
          const localCheck = this.login(trimmedEmail, password, rememberMe);
          if (localCheck.success) {
            try {
              const auth = StocksFirebase.getAuth();
              await auth.createUserWithEmailAndPassword(trimmedEmail, password);
            } catch (_) {}
            return localCheck;
          }
          if (fbErr && (fbErr.code === "auth/wrong-password" || fbErr.code === "auth/invalid-credential")) {
            return { success: false, message: "Incorrect admin password." };
          }
        }
      }

      // 2. Fallback to local admin check
      return this.login(trimmedEmail, password, rememberMe);
    },

    /**
     * Sign in with Google Popup (Restricted strictly to whitelisted admin emails)
     */
    loginWithGoogle: async function (rememberMe) {
      if (typeof StocksFirebase === "undefined" || !StocksFirebase.getAuth()) {
        return { success: false, message: "Firebase Authentication is not loaded." };
      }
      try {
        const auth = StocksFirebase.getAuth();
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await auth.signInWithPopup(provider);
        const fbUser = result.user;

        if (!this.isAllowedAdminEmail(fbUser.email)) {
          await auth.signOut();
          return {
            success: false,
            message: `Access denied for ${fbUser.email}. Only the Stocks 360 Founder/Admin account is allowed.`
          };
        }

        const sessionData = {
          email: fbUser.email,
          name: fbUser.displayName || "Gowrishankar",
          role: "Founder / Super Admin",
          uid: fbUser.uid,
          authProvider: "google",
          loggedInAt: Date.now()
        };
        storeSession(sessionData, rememberMe !== false);
        return { success: true, user: sessionData };
      } catch (err) {
        return {
          success: false,
          message: err.message || "Google Sign-In was cancelled or not yet enabled in Firebase Console."
        };
      }
    },

    /**
     * Synchronous credential verification
     */
    login: function (email, password, rememberMe) {
      const trimmedEmail = (email || "").trim().toLowerCase();
      const creds = getCredentials();
      const user = creds.find(c => c.email.toLowerCase() === trimmedEmail);

      if (!user) {
        return { success: false, message: "Unauthorized email address." };
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

      storeSession(sessionData, rememberMe);
      return { success: true, user: sessionData };
    },

    isAuthenticated: function () {
      try {
        const session = sessionStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem(STORAGE_KEYS.SESSION);
        if (!session) return false;
        const parsed = JSON.parse(session);
        return Boolean(parsed && parsed.email && this.isAllowedAdminEmail(parsed.email));
      } catch (e) {
        return false;
      }
    },

    getCurrentUser: function () {
      try {
        const session = sessionStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem(STORAGE_KEYS.SESSION);
        return session ? JSON.parse(session) : null;
      } catch (e) {
        return null;
      }
    },

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

      // Also update in Firebase Auth if currently signed in
      if (typeof StocksFirebase !== "undefined" && StocksFirebase.getAuth()) {
        const fbUser = StocksFirebase.getAuth().currentUser;
        if (fbUser && typeof fbUser.updatePassword === "function") {
          fbUser.updatePassword(newPassword).catch(() => {});
        }
      }

      return { success: true, message: "Password updated successfully!" };
    },

    logout: function () {
      sessionStorage.removeItem(STORAGE_KEYS.SESSION);
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      if (typeof StocksFirebase !== "undefined" && StocksFirebase.getAuth()) {
        StocksFirebase.getAuth().signOut().catch(() => {});
      }
      window.location.href = "admin-login.html";
    },

    protectPage: function () {
      const currentPage = window.location.pathname.split("/").pop();
      if (currentPage === "admin-login.html" || currentPage === "login.html") {
        if (this.isAuthenticated()) {
          window.location.href = "admin-news.html";
        }
        return;
      }

      if (!this.isAuthenticated()) {
        const redirectUrl = encodeURIComponent(window.location.href);
        window.location.href = "admin-login.html?unauthorized=true&redirect=" + redirectUrl;
      } else {
        document.addEventListener("DOMContentLoaded", function () {
          AdminAuth.renderAdminHeader();
        });
      }
    },

    renderAdminHeader: function () {
      const user = this.getCurrentUser();
      const headerRight = document.querySelector(".admin-header .container p.admin-user-info, .admin-header .container p:last-child");
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

if (typeof window !== "undefined") {
  window.AdminAuth = AdminAuth;
}
