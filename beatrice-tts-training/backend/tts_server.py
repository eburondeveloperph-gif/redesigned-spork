#!/usr/bin/env python3
"""
Beatrice TTS Backend Server

FastAPI-based backend for TTS inference.
Loads trained Kokoro models and serves audio via HTTP API.

Usage:
    uvicorn backend.tts_server:app --host 0.0.0.0 --port 8000

Endpoints:
    POST /api/beatrice/tts      - Generate TTS audio
    GET  /api/beatrice/voices   - List available voices
    GET  /media/tts/{path}      - Serve generated audio files
"""

import hashlib
import logging
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Beatrice TTS API", version="0.1.0")

# Configuration
MEDIA_DIR = Path("media/tts")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

MODEL_REGISTRY_PATH = Path("model_registry.yaml")

# In-memory model cache (loaded on first use)
_model_cache = {}


# ─── Pydantic Models ───────────────────────────────────────────────


class TTSRequest(BaseModel):
    text: str = Field(
        ..., min_length=1, max_length=5000, description="Text to synthesize"
    )
    language: str = Field(
        "en-US", description="Language code: nl-BE, fr-BE, de-DE, en-US"
    )
    voice: str = Field("beatrice", description="Voice identifier")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Speaking speed multiplier")
    format: str = Field("mp3", description="Output format: wav, mp3, ogg")


class TTSResponse(BaseModel):
    audio_url: str
    language: str
    duration_seconds: float
    model_version: str
    cached: bool


class VoiceInfo(BaseModel):
    language: str
    voice: str
    status: str
    model_version: str
    description: str


# ─── Model Registry ────────────────────────────────────────────────


def load_model_registry() -> dict:
    """Load model registry from YAML or return default."""
    if MODEL_REGISTRY_PATH.exists():
        import yaml

        with open(MODEL_REGISTRY_PATH, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    # Default registry for development
    return {
        "tts_models": {
            "nl-BE": {
                "provider": "kokoro",
                "model_path": "exports/kokoro-nl-BE-beatrice/model.onnx",
                "voicepack_path": "exports/kokoro-nl-BE-beatrice/voicepack.pt",
                "normalizer": "dutch_flemish",
                "phonemizer": "dutch_flemish",
                "status": "experimental",
                "version": "beatrice-nl-BE-v0.1",
                "description": "Beatrice Flemish voice (experimental)",
            },
            "fr-BE": {
                "provider": "kokoro",
                "model_path": "exports/kokoro-fr-BE-beatrice/model.onnx",
                "voicepack_path": "exports/kokoro-fr-BE-beatrice/voicepack.pt",
                "normalizer": "french_belgium",
                "phonemizer": "french",
                "status": "beta",
                "version": "beatrice-fr-BE-v0.1",
                "description": "Beatrice French (Belgium) voice",
            },
            "de-DE": {
                "provider": "kokoro",
                "model_path": "exports/kokoro-de-DE-beatrice/model.onnx",
                "voicepack_path": "exports/kokoro-de-DE-beatrice/voicepack.pt",
                "normalizer": "german",
                "phonemizer": "german",
                "status": "beta",
                "version": "beatrice-de-DE-v0.1",
                "description": "Beatrice German voice",
            },
            "en-US": {
                "provider": "fallback",
                "status": "fallback",
                "version": "fallback-v1",
                "description": "Fallback to system TTS",
            },
        }
    }


# ─── Text Normalization ────────────────────────────────────────────


def normalize_text(text: str, language: str) -> str:
    """Normalize text for the target language."""
    if language == "nl-BE":
        from phonemizers.dutch.normalize_nl_be import normalize as nl_normalize

        return nl_normalize(text)
    elif language in ("fr-BE", "fr-FR"):
        from phonemizers.french.normalize_fr_be import normalize as fr_normalize

        return fr_normalize(text)
    elif language == "de-DE":
        from phonemizers.german.normalize_de_de import normalize as de_normalize

        return de_normalize(text)
    return text


# ─── TTS Inference ─────────────────────────────────────────────────


def generate_audio(
    text: str, language: str, voice: str, speed: float, fmt: str
) -> tuple:
    """Generate TTS audio and return (file_path, duration_estimate, model_version).

    In a real implementation, this would:
    1. Load the Kokoro model for the language
    2. Normalize text
    3. Phonemize
    4. Run inference
    5. Save audio file
    6. Return path and metadata
    """
    registry = load_model_registry()
    models = registry.get("tts_models", {})

    model_info = models.get(language)
    if not model_info:
        # Fallback to English or raise error
        model_info = models.get("en-US")
        if not model_info:
            raise HTTPException(
                400, f"Language '{language}' not supported and no fallback available"
            )

    # Normalize text
    normalized_text = normalize_text(text, language)

    # Generate unique filename
    content_hash = hashlib.sha256(
        f"{normalized_text}:{language}:{voice}:{speed}".encode()
    ).hexdigest()[:16]
    date_dir = time.strftime("%Y-%m-%d")
    output_dir = MEDIA_DIR / date_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"beatrice-{language}-{content_hash}.{fmt}"
    output_path = output_dir / filename

    # Check cache
    cached = output_path.exists() and output_path.stat().st_size > 0

    if not cached:
        # Placeholder: In real implementation, run Kokoro inference here
        # For now, create an empty file to simulate
        output_path.write_bytes(b"")
        logger.info(f"Generated TTS audio: {output_path}")
    else:
        logger.info(f"Serving cached TTS audio: {output_path}")

    # Estimate duration (rough: ~0.08s per character for normal speech)
    duration = len(text) * 0.08 / speed

    return output_path, duration, model_info.get("version", "unknown"), cached


# ─── API Endpoints ─────────────────────────────────────────────────


@app.get("/")
async def root():
    return {"message": "Beatrice TTS API", "version": "0.1.0", "status": "running"}


@app.get("/api/beatrice/voices")
async def list_voices():
    """List all available TTS voices."""
    registry = load_model_registry()
    models = registry.get("tts_models", {})

    voices = []
    for lang, info in models.items():
        voices.append(
            {
                "language": lang,
                "voice": "beatrice",
                "status": info.get("status", "unknown"),
                "model_version": info.get("version", "unknown"),
                "description": info.get("description", ""),
            }
        )

    return {"voices": voices}


@app.post("/api/beatrice/tts")
async def synthesize(request: TTSRequest):
    """Generate TTS audio from text."""
    logger.info(
        f"TTS request: lang={request.language}, voice={request.voice}, text_len={len(request.text)}"
    )

    try:
        output_path, duration, version, cached = generate_audio(
            text=request.text,
            language=request.language,
            voice=request.voice,
            speed=request.speed,
            fmt=request.format,
        )

        # Build URL relative to media root
        audio_url = f"/media/tts/{output_path.relative_to(MEDIA_DIR)}"

        return TTSResponse(
            audio_url=audio_url,
            language=request.language,
            duration_seconds=round(duration, 2),
            model_version=version,
            cached=cached,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        raise HTTPException(500, f"TTS generation failed: {str(e)}")


@app.get("/media/tts/{date}/{filename}")
async def serve_audio(date: str, filename: str):
    """Serve generated audio files."""
    file_path = MEDIA_DIR / date / filename

    if not file_path.exists():
        raise HTTPException(404, "Audio file not found")

    # Determine content type
    content_type = "audio/mpeg"
    if filename.endswith(".wav"):
        content_type = "audio/wav"
    elif filename.endswith(".ogg"):
        content_type = "audio/ogg"
    elif filename.endswith(".mp3"):
        content_type = "audio/mpeg"

    return FileResponse(file_path, media_type=content_type, filename=filename)


@app.get("/api/beatrice/health")
async def health_check():
    """Health check endpoint."""
    registry = load_model_registry()
    models = registry.get("tts_models", {})

    return {
        "status": "healthy",
        "models_loaded": len(_model_cache),
        "models_available": len(models),
        "languages": list(models.keys()),
    }


# ─── Main ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
