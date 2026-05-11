# Beatrice TTS Training Pipeline

Kokoro-based multilingual TTS training for **Hermes CLI Agent**, branded as **Beatrice**.

## Languages

| Priority | Language | Status     | Config             |
| -------- | -------- | ---------- | ------------------ |
| 1        | French   | Beta       | `configs/fr-BE.yaml`   |
| 2        | German   | Beta       | `configs/de-DE.yaml`   |
| 3        | Flemish  | Experimental | `configs/nl-BE.yaml` |

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Prepare dataset
python scripts/prepare_dataset.py --config configs/fr-BE.yaml

# 3. Train (Stage 1: language, Stage 2: voice, Stage 3: export)
python scripts/train.py --config configs/fr-BE.yaml --stage 1
python scripts/train.py --config configs/fr-BE.yaml --stage 2
python scripts/train.py --config configs/fr-BE.yaml --stage 3

# 4. Evaluate
python scripts/evaluate_voice.py --config configs/fr-BE.yaml

# 5. Start backend
uvicorn backend.tts_server:app --host 0.0.0.0 --port 8000
```

## Repository Structure

```
beatrice-tts-training/
  configs/              # Language-specific training configs
  datasets/             # Raw, processed, and manifest data
  phonemizers/          # Text normalization per language
    dutch/normalize_nl_be.py
    french/normalize_fr_be.py
    german/normalize_de_de.py
  scripts/              # Training and evaluation scripts
    prepare_dataset.py
    train.py
    evaluate_voice.py
  checkpoints/          # Model checkpoints
  exports/              # Exported models for deployment
  samples/              # Baseline and evaluation samples
  eval/                 # Fixed test phrase files
  backend/              # FastAPI TTS server
  frontend-integration/ # JavaScript TTS client
```

## Training Stages

1. **Language Training** — Adapt Kokoro-82M base model to target language
2. **Voice Fine-tuning** — Fine-tune on target speaker recordings
3. **Export** — Export to ONNX/PyTorch with voicepack and config

## Backend API

```bash
# Start server
uvicorn backend.tts_server:app --host 0.0.0.0 --port 8000

# Generate TTS
curl -X POST http://localhost:8000/api/beatrice/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Ja, ik ben er.","language":"nl-BE","voice":"beatrice"}'
```

## Frontend Integration

```javascript
import { BeatriceTTS } from './frontend-integration/tts-client.js';

const tts = new BeatriceTTS({ backendUrl: 'http://localhost:8000' });
await tts.init();
await tts.speak({ text: 'Ja, ik ben er.', language: 'nl-BE' });
```

## License

- **Kokoro-82M**: Apache-2.0 (verify at [HuggingFace](https://huggingface.co/hexgrad/Kokoro-82M))
- **Training code**: MIT (see project LICENSE)
- **Datasets**: Verify individual dataset licenses before training
