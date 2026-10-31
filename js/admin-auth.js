/**
 * Stocks 360 - Admin Authentication & Authorization (admin-auth.js)
 * All Admin Credentials and Allowed Admin Emails are stored strictly in
 * Google Cloud Firebase (Firestore `site_settings/admin_credentials` & Firebase Auth)
 * and are NEVER hardcoded in GitHub.
 */

const AdminAuth = (function () {
  const STORAGE_KEYS = {
    CREDS: "stocks360_admin_credentials",
    ALLOWED: "stocks360_allowed_admin_emails",
    SESSION: "stocks360_admin_session"
  };

  function getCredentials() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CREDS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function getAllowedEmails() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ALLOWED);
      if (data) return JSON.parse(data);
      const creds = getCredentials();
      return creds.map(c => (c.email || "").toLowerCase()).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function saveCredentialsLocal(creds, allowedEmails) {
    try {
      if (Array.isArray(creds)) {
        localStorage.setItem(STORAGE_KEYS.CREDS, JSON.stringify(creds));
      }
      if (Array.isArray(allowedEmails)) {
        localStorage.setItem(STORAGE_KEYS.ALLOWED, JSON.stringify(allowedEmails));
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Fetch latest Admin Credentials from Google Firebase Firestore (`site_settings/admin_credentials`)
   */
  async function syncCredentialsFromFirebase() {
    if (typeof StocksFirebase === "undefined" || !StocksFirebase.isReady()) {
      return getCredentials();
    }
    try {
      const doc = await StocksFirebase.getDb()
        .collection("site_settings")
        .doc("admin_credentials")
        .get();
      if (doc.exists) {
        const data = doc.data() || {};
        const creds = data.credentialsJson ? JSON.parse(data.credentialsJson) : [];
        const allowed = data.allowedEmailsJson
          ? JSON.parse(data.allowedEmailsJson)
          : creds.map(c => (c.email || "").toLowerCase());
        saveCredentialsLocal(creds, allowed);
        return creds;
      }
    } catch (err) {
      console.warn("Firebase admin credentials sync note:", err.message);
    }
    return getCredentials();
  }

  // Real-time listener to keep admin credentials synced from Firebase
  function initFirebaseAdminSync() {
    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
      try {
        StocksFirebase.getDb()
          .collection("site_settings")
          .doc("admin_credentials")
          .onSnapshot(doc => {
            if (doc.exists) {
              const data = doc.data() || {};
              const creds = data.credentialsJson ? JSON.parse(data.credentialsJson) : [];
              const allowed = data.allowedEmailsJson
                ? JSON.parse(data.allowedEmailsJson)
                : creds.map(c => (c.email || "").toLowerCase());
              saveCredentialsLocal(creds, allowed);
            }
          }, () => {});
      } catch (_) {}
    }
  }

  function storeSession(sessionData, rememberMe) {
    if (rememberMe) {
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
    } else {
      sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
    }
  }

  initFirebaseAdminSync();

  return {
    isAllowedAdminEmail: function (email) {
      if (!email) return false;
      const lower = email.trim().toLowerCase();
      const allowed = getAllowedEmails();
      return allowed.some(e => e.toLowerCase() === lower);
    },

    /**
     * Authenticate admin via Google Firebase (Firestore & Firebase Auth)
     */
    loginAsync: async function (email, password, rememberMe) {
      const trimmedEmail = (email || "").trim().toLowerCase();

      // Always pull latest admin credentials from Firebase Firestore first
      await syncCredentialsFromFirebase();

      if (!this.isAllowedAdminEmail(trimmedEmail)) {
        return { success: false, message: "Access denied. This email is not an authorized Stocks 360 Admin in Firebase." };
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

          const creds = getCredentials();
          const matchedProfile = creds.find(c => c.email.toLowerCase() === trimmedEmail) || {};

          const sessionData = {
            email: fbUser.email,
            name: fbUser.displayName || matchedProfile.name || "Admin",
            role: matchedProfile.role || "Super Admin",
            uid: fbUser.uid,
            authProvider: "firebase",
            loggedInAt: Date.now()
          };
          storeSession(sessionData, rememberMe);
          return { success: true, user: sessionData };
        } catch (fbErr) {
          // Verify against Firebase Firestore `site_settings/admin_credentials`
          const firestoreCheck = this.login(trimmedEmail, password, rememberMe);
          if (firestoreCheck.success) {
            try {
              const auth = StocksFirebase.getAuth();
              await auth.createUserWithEmailAndPassword(trimmedEmail, password);
            } catch (_) {}
            return firestoreCheck;
          }
          if (fbErr && (fbErr.code === "auth/wrong-password" || fbErr.code === "auth/invalid-credential")) {
            return { success: false, message: "Incorrect admin password." };
          }
        }
      }

      // 2. Verify against synced Firebase Firestore credentials
      return this.login(trimmedEmail, password, rememberMe);
    },

    /**
     * Sign in with Google Popup (Verified against Firebase Firestore allowed admin emails)
     */
    loginWithGoogle: async function (rememberMe) {
      if (typeof StocksFirebase === "undefined" || !StocksFirebase.getAuth()) {
        return { success: false, message: "Firebase Authentication is not loaded." };
      }
      try {
        await syncCredentialsFromFirebase();
        const auth = StocksFirebase.getAuth();
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await auth.signInWithPopup(provider);
        const fbUser = result.user;

        if (!this.isAllowedAdminEmail(fbUser.email)) {
          await auth.signOut();
          return {
            success: false,
            message: `Access denied for ${fbUser.email}. Only authorized Firebase Admin accounts are allowed.`
          };
        }

        const creds = getCredentials();
        const matchedProfile = creds.find(c => c.email.toLowerCase() === fbUser.email.toLowerCase()) || {};

        const sessionData = {
          email: fbUser.email,
          name: fbUser.displayName || matchedProfile.name || "Admin",
          role: matchedProfile.role || "Founder / Super Admin",
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
     * Verify against Firebase-synced credential store
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
        return Boolean(parsed && parsed.email);
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
        return { success: false, message: "User not found in Firebase Admin store." };
      }

      if (creds[userIdx].passwordHash !== btoa(currentPassword)) {
        return { success: false, message: "Current password does not match." };
      }

      if (!newPassword || newPassword.length < 6) {
        return { success: false, message: "New password must be at least 6 characters long." };
      }

      creds[userIdx].passwordHash = btoa(newPassword);
      const allowed = getAllowedEmails();
      saveCredentialsLocal(creds, allowed);

      // Persist updated password directly to Google Firebase Firestore & Firebase Auth
      if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
        StocksFirebase.getDb()
          .collection("site_settings")
          .doc("admin_credentials")
          .set({
            credentialsJson: JSON.stringify(creds),
            allowedEmailsJson: JSON.stringify(allowed),
            updatedAt: Date.now()
          }, { merge: true })
          .catch(err => console.error("Firebase admin password update error:", err));

        const auth = StocksFirebase.getAuth();
        if (auth && auth.currentUser && typeof auth.currentUser.updatePassword === "function") {
          auth.currentUser.updatePassword(newPassword).catch(() => {});
        }
      }

      return { success: true, message: "Admin password updated in Google Firebase!" };
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
