#!/usr/bin/env python3
"""
Dataset preparation pipeline for Beatrice TTS training.

Usage:
    python scripts/prepare_dataset.py --config configs/fr-BE.yaml
    python scripts/prepare_dataset.py --config configs/de-DE.yaml
    python scripts/prepare_dataset.py --config configs/nl-BE.yaml

Outputs:
    - Processed audio files (mono, 24kHz, 16-bit WAV)
    - train/val/test manifest JSON files
    - Dataset statistics CSV
"""

import argparse
import json
import logging
from pathlib import Path
from typing import List, Optional, Tuple

import librosa
import numpy as np
import soundfile as sf
import yaml
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s"
)
logger = logging.getLogger(__name__)


def load_config(config_path: str) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def validate_audio_file(
    audio_path: Path,
    target_sr: int,
    min_duration: float,
    max_duration: float,
) -> Tuple[bool, Optional[dict]]:
    """Validate and inspect a single audio file.

    Returns (is_valid, metadata_dict).
    """
    try:
        y, sr = librosa.load(str(audio_path), sr=None, mono=False)

        # Convert to mono if needed
        if y.ndim > 1:
            y = librosa.to_mono(y)

        duration = librosa.get_duration(y=y, sr=sr)

        # Check duration bounds
        if duration < min_duration or duration > max_duration:
            return False, {"reason": f"duration {duration:.2f}s out of bounds"}

        # Check for silence (completely silent files are bad)
        if np.max(np.abs(y)) < 0.001:
            return False, {"reason": "essentially silent"}

        # Check for clipping
        peak = np.max(np.abs(y))
        is_clipped = peak > 0.99

        # Check for DC offset
        dc_offset = np.mean(y)

        metadata = {
            "original_sample_rate": sr,
            "duration": duration,
            "peak_amplitude": float(peak),
            "is_clipped": bool(is_clipped),
            "dc_offset": float(dc_offset),
            "is_mono": True,
        }

        return True, metadata

    except Exception as e:
        return False, {"reason": f"load error: {e}"}


def process_audio(
    input_path: Path,
    output_path: Path,
    target_sr: int,
    target_channels: int,
    normalize: bool = True,
    trim_silence: bool = True,
) -> dict:
    """Process a single audio file to target format.

    Returns metadata dict.
    """
    y, sr = librosa.load(str(input_path), sr=target_sr, mono=(target_channels == 1))

    # Trim silence
    if trim_silence:
        y, _ = librosa.effects.trim(y, top_db=40)

    # Normalize
    if normalize:
        peak = np.max(np.abs(y))
        if peak > 0:
            y = y / peak * 0.95

    # Save as 16-bit WAV
    sf.write(str(output_path), y, target_sr, subtype="PCM_16")

    duration = float(len(y)) / target_sr
    return {
        "processed_path": str(output_path),
        "duration": duration,
        "sample_rate": target_sr,
        "channels": target_channels,
    }


def discover_raw_files(raw_dir: Path) -> List[Path]:
    """Find all audio files in raw directory."""
    extensions = {"*.wav", "*.mp3", "*.flac", "*.ogg", "*.m4a", "*.mp4"}
    files = []
    for ext in extensions:
        files.extend(raw_dir.rglob(ext))
    return sorted(files)


def split_dataset(
    items: List[dict],
    train_ratio: float,
    val_ratio: float,
    test_ratio: float,
    seed: int = 42,
) -> Tuple[List[dict], List[dict], List[dict]]:
    """Split dataset into train/val/test."""
    assert abs(train_ratio + val_ratio + test_ratio - 1.0) < 1e-6

    np.random.seed(seed)
    indices = np.random.permutation(len(items))

    n_train = int(len(items) * train_ratio)
    n_val = int(len(items) * val_ratio)

    train_indices = indices[:n_train]
    val_indices = indices[n_train : n_train + n_val]
    test_indices = indices[n_train + n_val :]

    train = [items[i] for i in train_indices]
    val = [items[i] for i in val_indices]
    test = [items[i] for i in test_indices]

    return train, val, test


def save_manifest(items: List[dict], path: Path):
    with open(path, "w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")


def save_statistics(stats: dict, output_dir: Path):
    stats_path = output_dir / "dataset_statistics.json"
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)
    logger.info(f"Saved dataset statistics to {stats_path}")


def run_augmentation(y: np.ndarray, sr: int, config: dict) -> np.ndarray:
    """Apply light augmentation if enabled."""
    if not config.get("augment", False):
        return y

    # Random pitch shift
    pitch_range = config.get("pitch_shift_range", [-1.5, 1.5])
    n_steps = np.random.uniform(*pitch_range)
    y = librosa.effects.pitch_shift(y, sr=sr, n_steps=n_steps)

    # Random speed change
    speed_range = config.get("speed_range", [0.95, 1.05])
    rate = np.random.uniform(*speed_range)
    y = librosa.effects.time_stretch(y, rate=rate)

    return y


def main():
    parser = argparse.ArgumentParser(
        description="Prepare dataset for Beatrice TTS training"
    )
    parser.add_argument("--config", required=True, help="Path to config YAML file")
    parser.add_argument(
        "--skip-validation", action="store_true", help="Skip audio validation"
    )
    parser.add_argument(
        "--workers", type=int, default=4, help="Number of parallel workers"
    )
    args = parser.parse_args()

    config = load_config(args.config)
    data_cfg = config["data"]

    raw_dir = Path(data_cfg["raw_dir"])
    processed_dir = Path(data_cfg["processed_dir"])
    manifest_dir = Path("datasets/manifests")

    processed_dir.mkdir(parents=True, exist_ok=True)
    manifest_dir.mkdir(parents=True, exist_ok=True)

    # Discover raw files
    raw_files = discover_raw_files(raw_dir)
    logger.info(f"Found {len(raw_files)} raw audio files in {raw_dir}")

    if not raw_files:
        logger.warning("No audio files found. Exiting.")
        return

    # Phase 1: Validate all files
    valid_items = []
    rejected_items = []

    if not args.skip_validation:
        logger.info("Phase 1: Validating audio files...")
        for audio_path in tqdm(raw_files, desc="Validating"):
            is_valid, metadata = validate_audio_file(
                audio_path,
                target_sr=data_cfg["target_sample_rate"],
                min_duration=data_cfg["min_duration_seconds"],
                max_duration=data_cfg["max_duration_seconds"],
            )

            if is_valid:
                valid_items.append(
                    {
                        "original_path": str(audio_path),
                        **metadata,
                    }
                )
            else:
                rejected_items.append(
                    {
                        "original_path": str(audio_path),
                        **metadata,
                    }
                )

        logger.info(
            f"Validated: {len(valid_items)} valid, {len(rejected_items)} rejected"
        )
    else:
        valid_items = [{"original_path": str(p)} for p in raw_files]

    # Phase 2: Process valid files
    logger.info("Phase 2: Processing audio files...")
    processed_items = []
    speaker_counter = 0

    for item in tqdm(valid_items, desc="Processing"):
        original_path = Path(item["original_path"])

        # Generate output filename
        speaker_id = data_cfg["speaker_id"]
        speaker_counter += 1
        output_filename = f"{speaker_id}_{speaker_counter:06d}.wav"
        output_path = processed_dir / output_filename

        try:
            process_meta = process_audio(
                input_path=original_path,
                output_path=output_path,
                target_sr=data_cfg["target_sample_rate"],
                target_channels=data_cfg["target_channels"],
            )

            # Read transcript if available
            transcript_path = original_path.with_suffix(".txt")
            if not transcript_path.exists():
                transcript_path = original_path.parent / (original_path.stem + ".txt")

            text = ""
            if transcript_path.exists():
                with open(transcript_path, "r", encoding="utf-8") as f:
                    text = f.read().strip()

            processed_items.append(
                {
                    "audio": str(output_path.relative_to("datasets/processed")),
                    "text": text,
                    "language": data_cfg["language"],
                    "speaker_id": speaker_id,
                    "duration": process_meta["duration"],
                }
            )

        except Exception as e:
            logger.error(f"Failed to process {original_path}: {e}")
            rejected_items.append(
                {
                    "original_path": str(original_path),
                    "reason": f"processing error: {e}",
                }
            )

    logger.info(f"Processed: {len(processed_items)} files")

    # Phase 3: Split and save manifests
    logger.info("Phase 3: Splitting dataset...")
    train, val, test = split_dataset(
        processed_items,
        train_ratio=data_cfg["train_ratio"],
        val_ratio=data_cfg["val_ratio"],
        test_ratio=data_cfg["test_ratio"],
    )

    language = data_cfg["language"]
    save_manifest(train, manifest_dir / f"{language}_train.jsonl")
    save_manifest(val, manifest_dir / f"{language}_val.jsonl")
    save_manifest(test, manifest_dir / f"{language}_test.jsonl")

    # Save full manifest
    full_manifest_path = manifest_dir / f"{language}_manifest.jsonl"
    save_manifest(processed_items, full_manifest_path)

    # Statistics
    total_duration = sum(item["duration"] for item in processed_items)
    train_duration = sum(item["duration"] for item in train)
    val_duration = sum(item["duration"] for item in val)
    test_duration = sum(item["duration"] for item in test)

    stats = {
        "language": language,
        "total_files": len(processed_items),
        "rejected_files": len(rejected_items),
        "total_duration_hours": round(total_duration / 3600, 2),
        "train": {
            "files": len(train),
            "duration_hours": round(train_duration / 3600, 2),
        },
        "val": {"files": len(val), "duration_hours": round(val_duration / 3600, 2)},
        "test": {"files": len(test), "duration_hours": round(test_duration / 3600, 2)},
        "target_sample_rate": data_cfg["target_sample_rate"],
        "average_duration_seconds": round(total_duration / len(processed_items), 2)
        if processed_items
        else 0,
    }

    save_statistics(stats, processed_dir)

    # Save rejection log
    if rejected_items:
        rejection_path = processed_dir / "rejected_files.json"
        with open(rejection_path, "w", encoding="utf-8") as f:
            json.dump(rejected_items, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved {len(rejected_items)} rejected files to {rejection_path}")

    logger.info("=" * 50)
    logger.info("Dataset preparation complete!")
    logger.info(f"  Language: {language}")
    logger.info(
        f"  Total: {stats['total_files']} files, {stats['total_duration_hours']} hours"
    )
    logger.info(
        f"  Train: {stats['train']['files']} files, {stats['train']['duration_hours']} hours"
    )
    logger.info(
        f"  Val:   {stats['val']['files']} files, {stats['val']['duration_hours']} hours"
    )
    logger.info(
        f"  Test:  {stats['test']['files']} files, {stats['test']['duration_hours']} hours"
    )
    logger.info("=" * 50)


if __name__ == "__main__":
    main()
