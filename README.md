# Beatrice Static App

Plain static HTML/CSS/JS app for Beatrice. No bundler is required; deployment config is generated into `js/config/env.js` at build time.

## Local Setup

```bash
cp .env.example .env.local
# Fill .env.local with Firebase, Gemini, and optional Hermes/Memory values.
npm run env
npm run dev
```

Open `http://127.0.0.1:3000`.

## Static Hosting

Use this for Netlify, Vercel static output, Firebase Hosting, cPanel, or any static host:

```bash
npm run build
```

Publish the project root. Set the `BEATRICE_*` variables from `.env.example` in the host environment. The build script writes `js/config/env.js`, which is loaded before `js/main.js`.

## Required Env

Firebase auth requires:

- `BEATRICE_FIREBASE_API_KEY`
- `BEATRICE_FIREBASE_AUTH_DOMAIN`
- `BEATRICE_FIREBASE_DATABASE_URL`
- `BEATRICE_FIREBASE_PROJECT_ID`
- `BEATRICE_FIREBASE_APP_ID`

Gemini Live requires one of:

- `EBURONAI_API_KEY` preferred local alias
- `BEATRICE_GEMINI_API_KEY`

Optional:

- `BEATRICE_HERMES_ENABLED`
- `BEATRICE_HERMES_ENDPOINT`
- `BEATRICE_HERMES_USERNAME`
- `BEATRICE_HERMES_PASSWORD`
- `BEATRICE_HERMES_ACCESS_TOKEN`
- `BEATRICE_MEMORY_BASE_URL`

Static browser env is visible to users at runtime. Do not place private server-only secrets here unless the browser is intentionally allowed to call that service directly.

## Firebase Database Rules

Signed-in user data, including synced knowledge-base entries, is stored under `users/{uid}`. Deploy the included Realtime Database rules when using Firebase:

```bash
firebase deploy --only database
```

The rules allow each authenticated user to read/write only their own `users/{uid}` subtree.

## Knowledge Base

The Knowledge page indexes text, Markdown, JSON, CSV, PDF, and DOCX files into browser storage. When Firebase auth/database are configured and the user is signed in, the same indexed records are mirrored to Realtime Database under the signed-in user.

On the main chat page, Beatrice rebuilds the Gemini Live system instruction from:

- the base system prompt
- persona/settings
- recent conversation context
- indexed knowledge-base text

Each sent text message also includes the most relevant indexed KB snippets. If the uploaded files do not contain extractable text, the app marks them as not indexed instead of pretending the AI can use them.

## Notes

- Gemini Live is configured through `BEATRICE_GEMINI_API_VERSION`; default is `v1beta`.
- `npm run build` only generates runtime env for static hosting. It does not bundle the app.
- If `npm run dev` says port `3000` is already in use, the local static server is already running or another process owns that port.
- Because this is a static app, browser-callable API keys are visible in `js/config/env.js` after generation. Restrict Gemini/Firebase keys by allowed domains/referrers in Google Cloud/Firebase for production.
