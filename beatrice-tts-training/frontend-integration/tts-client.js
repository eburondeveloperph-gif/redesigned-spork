/**
 * Beatrice TTS Frontend Client
 *
 * Connects the Beatrice web frontend to the TTS backend API.
 * Provides audio playback, caching, and voice selection.
 *
 * Usage:
 *   import { BeatriceTTS } from './tts-client.js';
 *   const tts = new BeatriceTTS({ backendUrl: 'http://localhost:8000' });
 *   await tts.speak({ text: 'Ja, ik ben er.', language: 'nl-BE' });
 */

export class BeatriceTTS {
  constructor(options = {}) {
    this.backendUrl = options.backendUrl || '';
    this.defaultLanguage = options.defaultLanguage || 'en-US';
    this.defaultVoice = options.defaultVoice || 'beatrice';
    this.autoPlay = options.autoPlay !== false;
    this.cacheEnabled = options.cacheEnabled !== false;

    // Audio cache: Map<textHash, audioUrl>
    this._cache = new Map();

    // Current audio element
    this._audio = null;

    // Available voices (populated on init)
    this.voices = [];
  }

  /**
   * Initialize the TTS client and fetch available voices.
   */
  async init() {
    try {
      const response = await fetch(`${this.backendUrl}/api/beatrice/voices`);
      if (response.ok) {
        const data = await response.json();
        this.voices = data.voices || [];
        console.log('[BeatriceTTS] Voices loaded:', this.voices.map((v) => v.language));
      }
    } catch (err) {
      console.warn('[BeatriceTTS] Could not load voices:', err);
    }
  }

  /**
   * Generate cache key from request parameters.
   */
  _cacheKey({ text, language, voice, speed }) {
    return `${language}:${voice}:${speed}:${text}`;
  }

  /**
   * Call the TTS API to generate audio.
   */
  async generateAudio({ text, language, voice, speed, format }) {
    const cacheKey = this._cacheKey({ text, language: language || this.defaultLanguage, voice: voice || this.defaultVoice, speed: speed || 1.0 });

    // Check cache
    if (this.cacheEnabled && this._cache.has(cacheKey)) {
      return {
        audioUrl: this._cache.get(cacheKey),
        cached: true,
      };
    }

    const response = await fetch(`${this.backendUrl}/api/beatrice/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language: language || this.defaultLanguage,
        voice: voice || this.defaultVoice,
        speed: speed || 1.0,
        format: format || 'mp3',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `TTS API error: ${response.status}`);
    }

    const result = await response.json();

    // Cache the result
    if (this.cacheEnabled) {
      const fullUrl = result.audio_url.startsWith('http')
        ? result.audio_url
        : `${this.backendUrl}${result.audio_url}`;
      this._cache.set(cacheKey, fullUrl);
    }

    return {
      audioUrl: result.audio_url,
      duration: result.duration_seconds,
      version: result.model_version,
      cached: result.cached,
    };
  }

  /**
   * Speak the given text. Returns a Promise that resolves when audio finishes.
   */
  async speak({ text, language, voice, speed, format, onStart, onEnd, onError }) {
    try {
      // Generate or retrieve audio
      const { audioUrl, cached } = await this.generateAudio({
        text,
        language,
        voice,
        speed,
        format,
      });

      // Build full URL
      const fullUrl = audioUrl.startsWith('http') ? audioUrl : `${this.backendUrl}${audioUrl}`;

      // Stop any currently playing audio
      this.stop();

      // Create and play audio
      this._audio = new Audio(fullUrl);

      if (onStart) {
        this._audio.addEventListener('play', onStart);
      }

      if (onEnd) {
        this._audio.addEventListener('ended', onEnd);
      }

      return new Promise((resolve, reject) => {
        this._audio.addEventListener('ended', () => resolve({ finished: true }));
        this._audio.addEventListener('error', (e) => {
          if (onError) onError(e);
          reject(new Error('Audio playback failed'));
        });

        this._audio.play().catch((err) => {
          if (onError) onError(err);
          reject(err);
        });
      });
    } catch (err) {
      if (onError) onError(err);
      throw err;
    }
  }

  /**
   * Stop currently playing audio.
   */
  stop() {
    if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
      this._audio = null;
    }
  }

  /**
   * Check if audio is currently playing.
   */
  isPlaying() {
    return this._audio && !this._audio.paused;
  }

  /**
   * Get supported languages from loaded voices.
   */
  getSupportedLanguages() {
    return this.voices.map((v) => v.language);
  }

  /**
   * Pre-generate audio for a list of texts (warm-up cache).
   */
  async preload(texts, { language, voice, speed } = {}) {
    const promises = texts.map((text) =>
      this.generateAudio({ text, language, voice, speed }).catch((err) => {
        console.warn('[BeatriceTTS] Preload failed for:', text.substring(0, 50), err.message);
        return null;
      })
    );
    const results = await Promise.all(promises);
    return results.filter(Boolean);
  }

  /**
   * Clear the audio cache.
   */
  clearCache() {
    this._cache.clear();
  }
}

// Default export for module systems
export default BeatriceTTS;
