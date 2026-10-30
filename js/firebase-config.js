// firebase-config.js - Stocks 360 Firebase Integration
// Ready for Google Cloud Firebase Firestore & Authentication

const FIREBASE_CONFIG = {
  // Replace these with your Firebase project keys from console.firebase.google.com:
  apiKey: "YOUR_API_KEY",
  authDomain: "stocks-360.firebaseapp.com",
  projectId: "stocks-360",
  storageBucket: "stocks-360.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const StocksFirebase = (function () {
  let isConfigured = false;
  let db = null;
  let auth = null;

  function init() {
    // Check if real keys are supplied
    if (
      FIREBASE_CONFIG.apiKey &&
      FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" &&
      typeof firebase !== "undefined"
    ) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }
        db = firebase.firestore();
        auth = firebase.auth();
        isConfigured = true;
        console.log("Stocks 360: Connected to Firebase Firestore successfully.");
      } catch (err) {
        console.warn("Stocks 360: Firebase initialization error, using local data layer:", err);
      }
    }
  }

  // Attempt init on load if firebase script is present
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
