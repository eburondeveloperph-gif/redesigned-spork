# Full frontend and latency optimization pass

Changes applied:

- Replaced the long prompt in `js/config/config.js` with a shorter live-voice prompt.
- Added `CONFIG.PERFORMANCE` flags:
  - `ENABLE_DEFAULT_TOOLS: false`
  - `ENABLE_MEMORY: false`
  - `MEMORY_SEARCH_TIMEOUT_MS: 200`
- Updated `js/core/websocket-client.js` so Google Search/weather tool declarations are not sent unless explicitly enabled.
- Updated `js/main.js` so text messages are sent immediately when memory is disabled.
- Updated memory saving so it does not block `turncomplete`; when memory is disabled, it is skipped.
- Kept the optimized audio playback buffer at roughly 100ms in `js/audio/audio-streamer.js`.
- Confirmed mic visualization uses the existing `audioRecorder.stream` instead of opening a second microphone stream.
- Fixed duplicate streaming AI message bubble creation.
- Kept the modern mobile/glass frontend mapping.

Remaining production note:

- The Gemini API key is still in the frontend config so the project remains easy to run locally. For production, move the API call behind a backend proxy or restrict the key in Google Cloud.
