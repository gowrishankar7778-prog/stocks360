// firebase-config.js - Stocks 360 Firebase Integration
// Google API keys are excluded from Git and loaded directly from Firebase Hosting runtime.

const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "project-b005dc8f-09b3-4af6-b2b.firebaseapp.com",
  projectId: "project-b005dc8f-09b3-4af6-b2b",
  storageBucket: "project-b005dc8f-09b3-4af6-b2b.firebasestorage.app",
  messagingSenderId: "908383426122",
  appId: "1:908383426122:web:fb50660bbec7df8cccf8b3",
  measurementId: "G-XQ0CQSYELD"
};

const StocksFirebase = (function () {
  let isConfigured = false;
  let db = null;
  let auth = null;

  function loadFirebaseRuntimeConfig() {
    // 1. Check localStorage fallback if configured by admin
    const savedKey = typeof localStorage !== "undefined" ? localStorage.getItem("stocks360_firebase_api_key") : "";
    if (savedKey) {
      FIREBASE_CONFIG.apiKey = savedKey;
      return;
    }

    // 2. Load from Firebase Hosting runtime config (excluded from Git via .gitignore)
    const endpoints = ["js/firebase-secret.json", "/__/firebase/init.json"];
    for (let i = 0; i < endpoints.length; i++) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", endpoints[i], false);
        xhr.send(null);
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          const runtimeConfig = JSON.parse(xhr.responseText);
          if (runtimeConfig && runtimeConfig.apiKey) {
            Object.assign(FIREBASE_CONFIG, runtimeConfig);
            break;
          }
        }
      } catch (_) {
        // Continue to next endpoint or offline fallback
      }
    }
  }

  function init() {
    if (!FIREBASE_CONFIG.apiKey) {
      loadFirebaseRuntimeConfig();
    }

    if (
      FIREBASE_CONFIG.apiKey &&
      FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" &&
      typeof firebase !== "undefined"
    ) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }
        if (typeof firebase.firestore === "function") {
          db = firebase.firestore();
        }
        if (typeof firebase.auth === "function") {
          auth = firebase.auth();
        }
        isConfigured = true;
        console.log("Stocks 360: Connected to Firebase (stocks360) successfully.");
      } catch (err) {
        console.warn("Stocks 360: Firebase initialization error, using local data layer:", err);
      }
    }
  }

  if (typeof firebase !== "undefined") {
    init();
  }

  return {
    init: init,
    isReady: function () {
      return isConfigured && db !== null;
    },
    getDb: function () {
      return db;
    },
    getAuth: function () {
      return auth;
    }
  };
})();

if (typeof window !== "undefined") {
  window.StocksFirebase = StocksFirebase;
}
