#!/usr/bin/env python3
"""Cutter Studio local-only inventory and repeated intro/outro candidate scanner."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"}
WINDOW_SECONDS = 180
MIN_MATCH_SECONDS = 8
HASH_WIDTH = 16
HASH_HEIGHT = 16
AHASH_BITS = HASH_WIDTH * HASH_HEIGHT
DHASH_BITS = HASH_HEIGHT * (HASH_WIDTH - 1)
MAX_HASH_DISTANCE = 88  # ~17.7% of the combined 496-bit aHash + dHash signature
MAX_CONSECUTIVE_MISSES = 2
MAX_ALIGNMENT_SHIFT_SECONDS = 15
AUDIO_SAMPLE_RATE = 8000
AUDIO_CHANNELS = 4
AUDIO_SUBCHUNKS_PER_SECOND = 10
AUDIO_HASH_DISTANCE = 24
CACHE_SCHEMA = "cutter-studio-cache/v3"


def run(command: list[str], *, binary: bool = False):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode:
        message = result.stderr.decode("utf-8", "replace")[-1200:]
        raise RuntimeError(f"Comando falló ({result.returncode}): {' '.join(command[:4])}…\n{message}")
    return result.stdout if binary else result.stdout.decode("utf-8", "replace").strip()


def episode_number(path: Path) -> int | None:
    name = path.stem.lower()
    labeled = re.search(r"(?:episode|episodio|chapter|capitulo|cap|ep|e)[ ._-]*0*(\d{1,4})\b", name)
    if labeled:
        return int(labeled.group(1))
    numbers = re.findall(r"(?<!\d)(\d{1,4})(?!\d)", name)
    return int(numbers[-1]) if numbers else None


def probe(path: Path) -> dict:
    raw = run([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration,size:stream=width,height,codec_type",
        "-of", "json", str(path),
    ])
    data = json.loads(raw)
    streams = data.get("streams") or []
    stream = next((item for item in streams if item.get("codec_type") == "video"), {})
    fmt = data.get("format") or {}
    return {
        "duration_seconds": round(float(fmt.get("duration") or 0), 3),
        "width": stream.get("width"),
        "height": stream.get("height"),
        "has_audio": any(item.get("codec_type") == "audio" for item in streams),
        "size_bytes": int(fmt.get("size") or path.stat().st_size),
    }


def perceptual_hash(pixels: bytes) -> int:
    """Combine average luminance (aHash) and horizontal gradients (dHash)."""
    if len(pixels) != HASH_WIDTH * HASH_HEIGHT:
        raise ValueError(f"Se esperaban {HASH_WIDTH * HASH_HEIGHT} píxeles en escala de grises.")
    average = sum(pixels) / len(pixels)
    ahash = 0
    for pixel in pixels:
        ahash = (ahash << 1) | int(pixel >= average)

    dhash = 0
    for y in range(HASH_HEIGHT):
        row = y * HASH_WIDTH
        for x in range(HASH_WIDTH - 1):
            dhash = (dhash << 1) | int(pixels[row + x] >= pixels[row + x + 1])
    return (ahash << DHASH_BITS) | dhash


def quality_level(
    duration_seconds: int,
    match_ratio: float,
    mean_hash_distance: float,
    modality: str = "visual",
) -> str:
    """Grade one modality's match, not whether the sequence is definitely an OP/ED."""
    if modality == "audio":
        if duration_seconds >= 30 and match_ratio >= 0.90 and mean_hash_distance <= 12:
            return "high"
        if duration_seconds >= 15 and match_ratio >= 0.80 and mean_hash_distance <= 24:
            return "medium"
        return "low"
    if duration_seconds >= 30 and match_ratio >= 0.90 and mean_hash_distance <= 36:
        return "high"
    if duration_seconds >= 15 and match_ratio >= 0.80 and mean_hash_distance <= 66:
        return "medium"
    return "low"


def audio_fingerprints(raw: bytes) -> list[int]:
    """Create one 80-bit fingerprint per second from four filtered audio bands."""
    from array import array
    import math

    samples = array("f")
    samples.frombytes(raw)
    if sys.byteorder != "little":
        samples.byteswap()
    samples_per_second = AUDIO_SAMPLE_RATE * AUDIO_CHANNELS
    samples = samples[:len(samples) - (len(samples) % samples_per_second)]
    if not samples:
        return []

    subchunk_frames = AUDIO_SAMPLE_RATE // AUDIO_SUBCHUNKS_PER_SECOND
    subchunk_values = subchunk_frames * AUDIO_CHANNELS
    fingerprints = []
    for second_start in range(0, len(samples), samples_per_second):
        fingerprint = 0
        valid_bins = 0
        for subchunk_index in range(AUDIO_SUBCHUNKS_PER_SECOND):
            start = second_start + subchunk_index * subchunk_values
            powers = [0.0] * AUDIO_CHANNELS
            end = start + subchunk_values
            for sample_index in range(start, end, AUDIO_CHANNELS):
                for channel in range(AUDIO_CHANNELS):
                    value = samples[sample_index + channel]
                    powers[channel] += value * value
            powers = [value / subchunk_frames for value in powers]
            total = sum(powers)
            if total <= 1e-12 or math.sqrt(total / AUDIO_CHANNELS) < 0.002:
                continue
            valid_bins += 1
            for power in powers:
                quantized = min(3, int((power / total) * 4))
                fingerprint = (fingerprint << 2) | quantized
        fingerprints.append(
            fingerprint if valid_bins >= AUDIO_SUBCHUNKS_PER_SECOND * 0.7 else -1
        )
    return fingerprints


def audio_frame_hashes(path: Path, duration: float, edge: str) -> list[int]:
    """Extract local audio features from four frequency bands, one signature per second."""
    if duration <= 0:
        return []
    count = min(WINDOW_SECONDS, max(1, int(duration)))
    seek = 0 if edge == "start" else max(0, duration - count)
    filter_graph = (
        "[0:a:0]aresample=8000,aformat=channel_layouts=mono,asplit=4[a][b][c][d];"
        "[a]lowpass=f=250[lo];"
        "[b]highpass=f=250,lowpass=f=700[mid1];"
        "[c]highpass=f=700,lowpass=f=1800[mid2];"
        "[d]highpass=f=1800,lowpass=f=3800[hi];"
        "[lo][mid1][mid2][hi]amerge=inputs=4,"
        "aformat=sample_fmts=flt:sample_rates=8000:channel_layouts=4.0[out]"
    )
    raw = run([
        "ffmpeg", "-v", "error", "-ss", str(seek), "-i", str(path),
        "-t", str(count), "-filter_complex", filter_graph, "-map", "[out]",
        "-vn", "-sn", "-f", "f32le", "-ac", str(AUDIO_CHANNELS),
        "-ar", str(AUDIO_SAMPLE_RATE), "pipe:1",
    ], binary=True)
    return audio_fingerprints(raw)


def frame_hashes(path: Path, duration: float, edge: str) -> list[int]:
    if duration <= 0:
        return []
    count = min(WINDOW_SECONDS, max(1, int(duration)))
    # One tiny grayscale frame per second. Pixels and fingerprints stay local.
    seek = 0 if edge == "start" else max(0, duration - count)
    vf = f"fps=1,scale={HASH_WIDTH}:{HASH_HEIGHT}:flags=area,format=gray"
    raw = run([
        "ffmpeg", "-v", "error", "-ss", str(seek), "-i", str(path),
        "-t", str(count), "-vf", vf, "-an", "-sn", "-f", "rawvideo",
        "-pix_fmt", "gray", "pipe:1",
    ], binary=True)
    frame_size = HASH_WIDTH * HASH_HEIGHT
    return [
        perceptual_hash(raw[offset:offset + frame_size])
        for offset in range(0, len(raw) - frame_size + 1, frame_size)
    ]


def matching_runs(
    left: list[int],
    right: list[int],
    edge: str,
    *,
    max_hash_distance: int = MAX_HASH_DISTANCE,
    max_alignment_shift: int = MAX_ALIGNMENT_SHIFT_SECONDS,
    min_match_seconds: int = MIN_MATCH_SECONDS,
) -> list[dict]:
    """Align sampled signatures and tolerate up to two isolated mismatches."""
    if not left or not right:
        return []

    candidates = []
    max_shift = min(max_alignment_shift, max(len(left), len(right)) - 1)
    for shift in range(-max_shift, max_shift + 1):
        left_start = max(0, shift)
        right_start = max(0, -shift)
        limit = min(len(left) - left_start, len(right) - right_start)
        if limit < min_match_seconds:
            continue

        run_start = None
        last_match = None
        miss_count = 0
        distances = []
        for index in range(limit):
            left_hash = left[left_start + index]
            right_hash = right[right_start + index]
            distance = max_hash_distance + 1 if left_hash < 0 or right_hash < 0 else (left_hash ^ right_hash).bit_count()
            if distance <= max_hash_distance:
                if run_start is None:
                    run_start = index
                last_match = index
                miss_count = 0
                distances.append(distance)
            elif run_start is not None:
                miss_count += 1
                if miss_count > MAX_CONSECUTIVE_MISSES:
                    run_length = last_match - run_start + 1
                    if run_length >= min_match_seconds:
                        candidates.append({
                            "edge": edge,
                            "episode_a_offset_seconds": left_start + run_start,
                            "episode_b_offset_seconds": right_start + run_start,
                            "duration_seconds": run_length,
                            "alignment_shift_seconds": shift,
                            "matched_samples": len(distances),
                            "match_ratio": round(len(distances) / max(1, run_length), 3),
                            "mean_hash_distance": round(sum(distances) / max(1, len(distances)), 2),
                        })
                    run_start, last_match, miss_count, distances = None, None, 0, []
        if run_start is not None and last_match is not None:
            run_length = last_match - run_start + 1
            if run_length >= min_match_seconds:
                candidates.append({
                    "edge": edge,
                    "episode_a_offset_seconds": left_start + run_start,
                    "episode_b_offset_seconds": right_start + run_start,
                    "duration_seconds": run_length,
                    "alignment_shift_seconds": shift,
                    "matched_samples": len(distances),
                    "match_ratio": round(len(distances) / max(1, run_length), 3),
                    "mean_hash_distance": round(sum(distances) / max(1, len(distances)), 2),
                })

    # Nearby shifts usually represent the same physical sequence; keep the best-supported one.
    candidates.sort(
        key=lambda item: (
            item["duration_seconds"],
            item.get("match_ratio", 0),
            -item.get("mean_hash_distance", 256),
        ),
        reverse=True,
    )
    kept = []
    for candidate in candidates:
        a_start = candidate["episode_a_offset_seconds"]
        b_start = candidate["episode_b_offset_seconds"]
        duplicate = any(
            existing["edge"] == candidate["edge"]
            and abs(a_start - existing["episode_a_offset_seconds"]) <= 3
            and abs(b_start - existing["episode_b_offset_seconds"]) <= 3
            for existing in kept
        )
        if not duplicate:
            kept.append(candidate)
    return sorted(kept, key=lambda item: (item["episode_a_offset_seconds"], item["episode_b_offset_seconds"]))

def absolute_offset(offset: int, duration: float, edge: str) -> int:
    """Convert a sampled-window offset into seconds from the episode's start."""
    if edge == "end":
        window_length = min(WINDOW_SECONDS, max(1, int(duration)))
        return max(0, int(duration - window_length)) + offset
    return offset


def file_signature(path: Path) -> dict:
    stat = path.stat()
    return {"size_bytes": stat.st_size, "mtime_ns": stat.st_mtime_ns}


def load_cache(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("schema") == CACHE_SCHEMA and isinstance(data.get("entries"), dict):
            return data["entries"]
    except (OSError, json.JSONDecodeError, AttributeError):
        pass
    return {}


def save_cache(path: Path, entries: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(
        json.dumps({"schema": CACHE_SCHEMA, "entries": entries}, ensure_ascii=False),
        encoding="utf-8",
    )
    temporary.replace(path)


def scan(folder: Path, output: Path, recursive: bool = False, use_cache: bool = True, cache_path: Path | None = None) -> dict:
    if not folder.is_dir():
        raise ValueError(f"No existe la carpeta: {folder}")
    paths = sorted(
        (p for p in (folder.rglob("*") if recursive else folder.iterdir())
         if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS),
        key=lambda p: p.name.lower(),
    )
    if not paths:
        raise ValueError("No encontré vídeos compatibles en esa carpeta.")
    videos = []
    hashes = {}
    errors = []
    selected_cache_path = (cache_path or (folder / ".cutter-studio-cache.json")).expanduser().resolve()
    old_cache = load_cache(selected_cache_path) if use_cache else {}
    new_cache = {}
    cache_hits = 0
    for path in paths:
        try:
            resolved = str(path.resolve())
            signature = file_signature(path)
            cached = old_cache.get(resolved)
            if use_cache and isinstance(cached, dict) and cached.get("signature") == signature:
                meta = cached.get("metadata")
                serialized_hashes = cached.get("hashes")
                if isinstance(meta, dict) and isinstance(serialized_hashes, dict):
                    hashes[path] = {
                        edge: [int(value, 16) for value in serialized_hashes.get(edge, [])]
                        for edge in ("start", "end")
                    }
                    cache_hits += 1
                else:
                    meta = None
            else:
                meta = None

            if meta is None:
                meta = probe(path)
                hashes[path] = {}
                if meta["duration_seconds"] >= MIN_MATCH_SECONDS:
                    hashes[path]["start"] = frame_hashes(path, meta["duration_seconds"], "start")
                    hashes[path]["end"] = frame_hashes(path, meta["duration_seconds"], "end")
            entry = {
                "filename": path.name,
                "path": resolved,
                "episode_number": episode_number(path),
                **meta,
            }
            videos.append(entry)
            if use_cache:
                new_cache[resolved] = {
                    "signature": signature,
                    "metadata": meta,
                    "hashes": {
                        edge: [format(value, "x") for value in hashes[path].get(edge, [])]
                        for edge in ("start", "end")
                    },
                }
        except (RuntimeError, ValueError, OSError, json.JSONDecodeError, TypeError) as exc:
            errors.append({"filename": path.name, "error": str(exc)})
    if use_cache:
        save_cache(selected_cache_path, new_cache)
    videos.sort(key=lambda v: (v["episode_number"] is None, v["episode_number"] or 0, v["filename"].lower()))
    candidates = []
    valid_paths = list(hashes)
    for i, left_path in enumerate(valid_paths):
        for right_path in valid_paths[i + 1:]:
            left_meta = next(v for v in videos if v["path"] == str(left_path.resolve()))
            right_meta = next(v for v in videos if v["path"] == str(right_path.resolve()))
            for edge in ("start", "end"):
                a = hashes[left_path].get(edge, [])
                b = hashes[right_path].get(edge, [])
                for match in matching_runs(a, b, edge):
                    match["episode_a_offset_seconds"] = absolute_offset(
                        match["episode_a_offset_seconds"], left_meta["duration_seconds"], edge
                    )
                    match["episode_b_offset_seconds"] = absolute_offset(
                        match["episode_b_offset_seconds"], right_meta["duration_seconds"], edge
                    )
                    for side, meta in (("a", left_meta), ("b", right_meta)):
                        match_start = float(match[f"episode_{side}_offset_seconds"])
                        match_end = match_start + float(match["duration_seconds"])
                        episode_duration = float(meta["duration_seconds"])
                        # If a repeated sequence touches an episode edge, propose the full edge-to-match interval.
                        # This expands only near the file boundary; internal matches remain untouched for review.
                        cut_start = 0.0 if edge == "start" and match_start <= 10 else match_start
                        cut_end = episode_duration if edge == "end" and episode_duration - match_end <= 10 else min(episode_duration, match_end)
                        match[f"episode_{side}_cut_start_seconds"] = round(cut_start, 3)
                        match[f"episode_{side}_cut_end_seconds"] = round(cut_end, 3)
                        match[f"episode_{side}_boundary_expanded"] = (
                            cut_start < match_start or cut_end > match_end
                        )
                    candidates.append({
                        "episode_a": left_path.name,
                        "episode_b": right_path.name,
                        "episode_a_number": left_meta["episode_number"],
                        "episode_b_number": right_meta["episode_number"],
                        "confidence": "candidate",
                        "match_quality": {
                            "matched_samples": match.get("matched_samples", 0),
                            "match_ratio": match.get("match_ratio", 0),
                            "mean_hash_distance": match.get("mean_hash_distance", AHASH_BITS + DHASH_BITS),
                            "level": quality_level(
                                int(match.get("duration_seconds", 0)),
                                float(match.get("match_ratio", 0)),
                                float(match.get("mean_hash_distance", AHASH_BITS + DHASH_BITS)),
                            ),
                        },
                        **match,
                    })
    report = {
        "schema": "cutter-studio-scan/v1",
        "source_folder": str(folder.resolve()),
        "video_count": len(videos),
        "cache": {
            "enabled": use_cache,
            "hits": cache_hits,
            "misses": max(0, len(videos) - cache_hits),
            "path": str(selected_cache_path) if use_cache else None,
        },
        "videos_in_proposed_order": videos,
        "repeated_sequence_candidates": candidates,
        "errors": errors,
        "notes": [
            "Coincidencias visuales aproximadas; revisar antes de recortar.",
            "No se modificaron ni subieron los vídeos originales.",
            "La detección usa muestras visuales; aún no analiza huellas de audio."
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Cutter Studio: escaneo de vídeos totalmente local.")
    sub = parser.add_subparsers(dest="command", required=True)
    scan_parser = sub.add_parser("scan", help="Inventariar episodios y detectar secuencias visuales repetidas.")
    scan_parser.add_argument("folder", type=Path, help="Carpeta local con episodios.")
    scan_parser.add_argument("--output", type=Path, default=Path("cutter-scan-report.json"))
    scan_parser.add_argument("--recursive", action="store_true", help="Incluir subcarpetas.")
    scan_parser.add_argument("--no-cache", action="store_true", help="Volver a analizar todos los vídeos sin usar caché.")
    scan_parser.add_argument("--cache-file", type=Path, help="Ruta opcional para la caché local.")
    args = parser.parse_args()

    missing = [tool for tool in ("ffmpeg", "ffprobe") if shutil.which(tool) is None]
    if missing:
        print("Faltan dependencias en PATH: " + ", ".join(missing), file=sys.stderr)
        return 2
    try:
        report = scan(args.folder.expanduser(), args.output.expanduser(), args.recursive, not args.no_cache, args.cache_file)
    except (ValueError, RuntimeError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"Vídeos analizados: {report['video_count']}")
    if report["cache"]["enabled"]:
        print(f"Caché local: {report['cache']['hits']} reutilizados; {report['cache']['misses']} nuevos o modificados")
    print(f"Candidatas a opening/ending: {len(report['repeated_sequence_candidates'])}")
    print(f"Informe local: {args.output.resolve()}")
    if report["errors"]:
        print(f"Archivos con error: {len(report['errors'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
