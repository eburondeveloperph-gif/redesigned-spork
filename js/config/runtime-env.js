const runtimeEnv = Object.freeze({
  ...(globalThis.__BEATRICE_ENV__ || {}),
});

function readRuntimeEnv(names, fallback = "") {
  const keys = Array.isArray(names) ? names : [names];

  for (const key of keys) {
    const value = runtimeEnv[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return fallback;
}

function readRuntimeBoolean(names, fallback = false) {
  const value = readRuntimeEnv(names, "");
  if (!value) return fallback;

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readRuntimeNumber(names, fallback) {
  const value = Number(readRuntimeEnv(names, ""));
  return Number.isFinite(value) ? value : fallback;
}

function hasRuntimeEnv(names) {
  return readRuntimeEnv(names, "") !== "";
}

export {
  runtimeEnv,
  readRuntimeEnv,
  readRuntimeBoolean,
  readRuntimeNumber,
  hasRuntimeEnv,
};
