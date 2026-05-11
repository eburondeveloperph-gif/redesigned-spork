# Static Runtime Config

This app stays deployable as plain static hosting. Secrets and project-specific values do not live in source modules.

## Local

1. Copy `.env.example` to `.env.local`.
2. Fill in Firebase, Gemini, and optional Hermes/Memory values.
3. Run `npm run env`.
4. Serve the folder with `npm run dev` or any static server.

`npm run env` generates `js/config/env.js`, which is loaded before `js/main.js`.

## Static Hosting

Use `npm run build` as the build command and publish this folder. Set the same `BEATRICE_*` variables in the host dashboard.

`js/config/env.js` is intentionally ignored by git. Static browser env is public at runtime, so do not put private server-only credentials in it unless the endpoint is meant to be called directly by the browser.
