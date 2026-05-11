// Firebase ESM imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js"
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js"
import {
  getDatabase,
  ref,
  get,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js"

const GOOGLE_OAUTH_TOKEN_STORAGE_KEY = "beatrice_google_oauth_access_token"

// Build config from runtime env
function buildConfig() {
  const env = window.__BEATRICE_ENV__ || {};
  
  const get = (keys) => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) {
      const v = env[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        return String(v).trim();
      }
    }
    return "";
  };

  return {
    firebase: {
      apiKey: get(["BEATRICE_FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY"]),
      authDomain: get(["BEATRICE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"]),
      databaseURL: get(["BEATRICE_FIREBASE_DATABASE_URL", "VITE_FIREBASE_DATABASE_URL"]),
      projectId: get(["BEATRICE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"]),
      storageBucket: get(["BEATRICE_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET"]),
      messagingSenderId: get(["BEATRICE_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID"]),
      appId: get(["BEATRICE_FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID"]),
      measurementId: get(["BEATRICE_FIREBASE_MEASUREMENT_ID", "VITE_FIREBASE_MEASUREMENT_ID"]),
    },
    gemini: {
      apiKey: get(["BEATRICE_GEMINI_API_KEY", "EBURONAI_API_KEY", "VITE_GEMINI_API_KEY"]),
      wsBaseUrl: get(["BEATRICE_GEMINI_WS_BASE_URL"]) || "wss://generativelanguage.googleapis.com/ws",
      apiVersion: get(["BEATRICE_GEMINI_API_VERSION"]) || "v1beta",
      modelName: get(["BEATRICE_GEMINI_MODEL"]) || "models/gemini-2.5-flash-native-audio-preview-12-2025",
    },
    googleTools: {
      enabled: get(["BEATRICE_GOOGLE_TOOLS_ENABLED"]) === "true",
    }
  };
}

const config = buildConfig();
const REQUIRED_FIREBASE_KEYS = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
const missingKeys = REQUIRED_FIREBASE_KEYS.filter(k => !config.firebase[k]);
const isFirebaseConfigured = missingKeys.length === 0;

console.log("[Firebase] Runtime env loaded, isFirebaseConfigured:", isFirebaseConfigured);
console.log("[Firebase] Window env keys:", Object.keys(window.__BEATRICE_ENV__ || {}).join(", "));

// Initialize Firebase
let app = null;
try {
  if (isFirebaseConfigured) {
    console.log("[Firebase] Initializing Firebase...");
    app = initializeApp(config.firebase);
    console.log("[Firebase] Firebase initialized!");
  } else {
    console.error("[Firebase] Missing config:", missingKeys.join(", "));
  }
} catch (error) {
  console.error("[Firebase] Error:", error.message);
}

export const auth = app ? getAuth(app) : null;
export const db = app ? getDatabase(app) : null;

// Re-export config for other modules
export const CONFIG = {
  API: config.gemini,
  GOOGLE_TOOLS: config.googleTools,
};

// Google provider
export const googleProvider = new GoogleAuthProvider();

if (config.googleTools.enabled) {
  googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
  googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
  googleProvider.addScope('https://www.googleapis.com/auth/tasks');
  googleProvider.addScope('https://www.googleapis.com/auth/calendar');
  googleProvider.addScope('https://www.googleapis.com/auth/drive');
}

// Helpers
export function getGoogleAccessTokenFromCredential(cred) {
  return GoogleAuthProvider.credentialFromResult(cred)?.accessToken || null;
}

export function storeGoogleOAuthAccessToken(token) {
  if (token) sessionStorage.setItem(GOOGLE_OAUTH_TOKEN_STORAGE_KEY, token);
}

export function getStoredGoogleOAuthAccessToken() {
  return sessionStorage.getItem(GOOGLE_OAUTH_TOKEN_STORAGE_KEY) || "";
}

export function clearStoredGoogleOAuthAccessToken() {
  sessionStorage.removeItem(GOOGLE_OAUTH_TOKEN_STORAGE_KEY);
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  ref,
  get,
  set,
  update,
};
