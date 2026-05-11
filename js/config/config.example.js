// Example only. Real runtime values are generated into js/config/env.js from
// .env.local or static-hosting environment variables.
export const CONFIG = {
    API: {
        KEY: "",
        BASE_URL: "wss://generativelanguage.googleapis.com/ws",
        VERSION: "v1beta",
        MODEL_NAME: "models/gemini-2.5-flash-native-audio-preview-12-2025",
    },
    FIREBASE_ENV_KEYS: [
        "BEATRICE_FIREBASE_API_KEY",
        "BEATRICE_FIREBASE_AUTH_DOMAIN",
        "BEATRICE_FIREBASE_DATABASE_URL",
        "BEATRICE_FIREBASE_PROJECT_ID",
        "BEATRICE_FIREBASE_STORAGE_BUCKET",
        "BEATRICE_FIREBASE_MESSAGING_SENDER_ID",
        "BEATRICE_FIREBASE_APP_ID",
        "BEATRICE_FIREBASE_MEASUREMENT_ID",
    ],
};

export default CONFIG;
