import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputFile = path.join(rootDir, "js", "config", "env.js");

const ENV_FILES = [".env", ".env.local"];

const PUBLIC_KEYS = [
  "BEATRICE_GEMINI_API_KEY",
  "BEATRICE_GEMINI_MODEL",
  "BEATRICE_GEMINI_WS_BASE_URL",
  "BEATRICE_GEMINI_API_VERSION",
  "BEATRICE_FIREBASE_API_KEY",
  "BEATRICE_FIREBASE_AUTH_DOMAIN",
  "BEATRICE_FIREBASE_DATABASE_URL",
  "BEATRICE_FIREBASE_PROJECT_ID",
  "BEATRICE_FIREBASE_STORAGE_BUCKET",
  "BEATRICE_FIREBASE_MESSAGING_SENDER_ID",
  "BEATRICE_FIREBASE_APP_ID",
  "BEATRICE_FIREBASE_MEASUREMENT_ID",
  "BEATRICE_GOOGLE_TOOLS_ENABLED",
  "BEATRICE_HERMES_ENABLED",
  "BEATRICE_HERMES_ENDPOINT",
  "BEATRICE_HERMES_USERNAME",
  "BEATRICE_HERMES_PASSWORD",
  "BEATRICE_HERMES_ACCESS_TOKEN",
  "BEATRICE_MEMORY_BASE_URL",
  "BEATRICE_MEMORY_SEARCH_TIMEOUT_MS",
];

const ALIASES = {
  BEATRICE_GEMINI_API_KEY: [
    "EBURONAI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "VITE_GEMINI_API_KEY",
  ],
  BEATRICE_FIREBASE_API_KEY: ["FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY"],
  BEATRICE_FIREBASE_AUTH_DOMAIN: ["FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"],
  BEATRICE_FIREBASE_DATABASE_URL: ["FIREBASE_DATABASE_URL", "VITE_FIREBASE_DATABASE_URL"],
  BEATRICE_FIREBASE_PROJECT_ID: ["FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"],
  BEATRICE_FIREBASE_STORAGE_BUCKET: ["FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET"],
  BEATRICE_FIREBASE_MESSAGING_SENDER_ID: [
    "FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
  ],
  BEATRICE_FIREBASE_APP_ID: ["FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID"],
  BEATRICE_FIREBASE_MEASUREMENT_ID: ["FIREBASE_MEASUREMENT_ID", "VITE_FIREBASE_MEASUREMENT_ID"],
};

function parseEnv(contents) {
  const parsed = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

async function readEnvFiles() {
  const result = {};

  for (const fileName of ENV_FILES) {
    try {
      const filePath = path.join(rootDir, fileName);
      const contents = await readFile(filePath, "utf8");
      Object.assign(result, parseEnv(contents));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return result;
}

function resolveValue(key, fileEnv) {
  const candidates = [key, ...(ALIASES[key] || [])];

  for (const candidate of candidates) {
    if (process.env[candidate]) return process.env[candidate];
    if (fileEnv[candidate]) return fileEnv[candidate];
  }

  return "";
}

const fileEnv = await readEnvFiles();
const runtimeEnv = {};

for (const key of PUBLIC_KEYS) {
  const value = resolveValue(key, fileEnv);
  if (value !== "") runtimeEnv[key] = value;
}

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(
  outputFile,
  `window.__BEATRICE_ENV__ = ${JSON.stringify(runtimeEnv, null, 2)};\n`,
  "utf8",
);

const configuredCount = Object.keys(runtimeEnv).length;
console.log(`Generated js/config/env.js with ${configuredCount} runtime value${configuredCount === 1 ? "" : "s"}.`);
