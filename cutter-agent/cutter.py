#!/usr/bin/env python3
"""Cutter Studio local-only inventory and repeated intro/outro candidate scanner."""
from __future__ import annotations

import argparse
import json
import math
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
    try:
        duration = float(fmt.get("duration") or 0)
        size_bytes = int(fmt.get("size") or path.stat().st_size)
    except (TypeError, ValueError, OSError) as exc:
        raise ValueError(f"Metadatos no válidos para {path.name}: {exc}") from exc
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError(f"Duración no válida para {path.name}.")
    if size_bytes <= 0 or not stream.get("width") or not stream.get("height"):
        raise ValueError(f"Vídeo sin dimensiones o tamaño válidos: {path.name}.")
    return {
        "duration_seconds": round(duration, 3),
        "width": stream.get("width"),
        "height": stream.get("height"),
        "has_audio": any(item.get("codec_type") == "audio" for item in streams),
        "size_bytes": size_bytes,
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
                # Reserve this subchunk's bits so temporal positions remain aligned.
                fingerprint <<= AUDIO_CHANNELS * 2
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
    fingerprints = audio_fingerprints(raw)
    active = [value for value in fingerprints if value >= 0]
    # Constant tones/music-free beds have too little timing information and cause false positives.
    if len(active) >= MIN_MATCH_SECONDS and len(set(active)) / len(active) < 0.15:
        return [-1 for _ in fingerprints]
    return fingerprints


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
        a_end = a_start + candidate["duration_seconds"]
        b_end = b_start + candidate["duration_seconds"]

        def overlaps_same_run(existing: dict) -> bool:
            if existing["edge"] != candidate["edge"]:
                return False
            if abs(a_start - existing["episode_a_offset_seconds"]) > MAX_ALIGNMENT_SHIFT_SECONDS:
                return False
            if abs(b_start - existing["episode_b_offset_seconds"]) > MAX_ALIGNMENT_SHIFT_SECONDS:
                return False
            existing_a_start = existing["episode_a_offset_seconds"]
            existing_b_start = existing["episode_b_offset_seconds"]
            existing_a_end = existing_a_start + existing["duration_seconds"]
            existing_b_end = existing_b_start + existing["duration_seconds"]
            overlap_a = max(0, min(a_end, existing_a_end) - max(a_start, existing_a_start))
            overlap_b = max(0, min(b_end, existing_b_end) - max(b_start, existing_b_start))
            shorter = min(candidate["duration_seconds"], existing["duration_seconds"])
            return shorter > 0 and overlap_a / shorter >= 0.70 and overlap_b / shorter >= 0.70

        if not any(overlaps_same_run(existing) for existing in kept):
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


def scan(
    folder: Path,
    output: Path,
    recursive: bool = False,
    use_cache: bool = True,
    cache_path: Path | None = None,
    progress: bool = False,
) -> dict:
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
    audio_warnings = []
    selected_cache_path = (cache_path or (folder / ".cutter-studio-cache.json")).expanduser().resolve()
    old_cache = load_cache(selected_cache_path) if use_cache else {}
    new_cache = {}
    cache_hits = 0
    modalities = ("visual", "audio")

    for file_index, path in enumerate(paths, start=1):
        file_audio_warnings = []
        was_cached = False
        resolved = None
        if progress:
            print(f"[{file_index}/{len(paths)}] Analizando {path.name}...", flush=True)
        try:
            resolved = str(path.resolve())
            signature = file_signature(path)
            cached = old_cache.get(resolved)
            meta = None
            if use_cache and isinstance(cached, dict) and cached.get("signature") == signature:
                possible_meta = cached.get("metadata")
                serialized_hashes = cached.get("hashes")
                if isinstance(possible_meta, dict) and isinstance(serialized_hashes, dict):
                    try:
                        hashes[path] = {
                            modality: {
                                edge: [int(value, 16) for value in serialized_hashes.get(modality, {}).get(edge, [])]
                                for edge in ("start", "end")
                            }
                            for modality in modalities
                        }
                        meta = possible_meta
                        was_cached = True
                        cached_audio_warnings = cached.get("audio_warnings", [])
                        if isinstance(cached_audio_warnings, list):
                            audio_warnings.extend(
                                warning for warning in cached_audio_warnings if isinstance(warning, dict)
                            )
                        cache_hits += 1
                    except (ValueError, TypeError, AttributeError):
                        meta = None
            if meta is None:
                meta = probe(path)
                hashes[path] = {
                    modality: {"start": [], "end": []}
                    for modality in modalities
                }
                if meta["duration_seconds"] >= MIN_MATCH_SECONDS:
                    for edge in ("start", "end"):
                        hashes[path]["visual"][edge] = frame_hashes(path, meta["duration_seconds"], edge)
                        if meta.get("has_audio"):
                            try:
                                hashes[path]["audio"][edge] = audio_frame_hashes(path, meta["duration_seconds"], edge)
                            except (RuntimeError, ValueError, OSError) as exc:
                                warning = {
                                    "filename": path.name,
                                    "edge": edge,
                                    "error": str(exc),
                                }
                                file_audio_warnings.append(warning)
                                audio_warnings.append(warning)
            entry = {
                "filename": path.name,
                "path": resolved,
                "episode_number": episode_number(path),
                **meta,
            }
            videos.append(entry)
            if progress:
                label = "caché reutilizada" if was_cached else "huellas calculadas"
                print(f"    {label}", flush=True)
            if use_cache:
                new_cache[resolved] = {
                    "signature": signature,
                    "metadata": meta,
                    "audio_warnings": file_audio_warnings,
                    "hashes": {
                        modality: {
                            edge: [format(value, "x") for value in hashes[path][modality].get(edge, [])]
                            for edge in ("start", "end")
                        }
                        for modality in modalities
                    },
                }
        except (RuntimeError, ValueError, OSError, json.JSONDecodeError, TypeError) as exc:
            # A partially extracted fingerprint must never be compared without valid metadata.
            hashes.pop(path, None)
            if resolved is not None:
                new_cache.pop(resolved, None)
            errors.append({"filename": path.name, "error": str(exc)})
            if progress:
                print(f"    ERROR: {exc}", flush=True)

    if use_cache:
        save_cache(selected_cache_path, new_cache)

    videos.sort(key=lambda v: (v["episode_number"] is None, v["episode_number"] or 0, v["filename"].lower()))
    candidates = []
    valid_paths = list(hashes)
    pair_total = len(valid_paths) * (len(valid_paths) - 1) // 2
    pair_index = 0
    progress_step = max(1, pair_total // 20)
    for i, left_path in enumerate(valid_paths):
        for right_path in valid_paths[i + 1:]:
            pair_index += 1
            if progress and (pair_index % progress_step == 0 or pair_index == pair_total):
                percentage = round(100 * pair_index / max(1, pair_total))
                print(f"Comparando secuencias: {pair_index}/{pair_total} pares ({percentage}%)", flush=True)
            left_meta = next(v for v in videos if v["path"] == str(left_path.resolve()))
            right_meta = next(v for v in videos if v["path"] == str(right_path.resolve()))
            for edge in ("start", "end"):
                for modality in modalities:
                    left_signatures = hashes[left_path][modality].get(edge, [])
                    right_signatures = hashes[right_path][modality].get(edge, [])
                    if not left_signatures or not right_signatures:
                        continue
                    threshold = AUDIO_HASH_DISTANCE if modality == "audio" else MAX_HASH_DISTANCE
                    for match in matching_runs(
                        left_signatures,
                        right_signatures,
                        edge,
                        max_hash_distance=threshold,
                    ):
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
                            cut_start = 0.0 if edge == "start" and match_start <= 10 else match_start
                            cut_end = episode_duration if edge == "end" and episode_duration - match_end <= 10 else min(episode_duration, match_end)
                            match[f"episode_{side}_cut_start_seconds"] = round(cut_start, 3)
                            match[f"episode_{side}_cut_end_seconds"] = round(cut_end, 3)
                            match[f"episode_{side}_boundary_expanded"] = (
                                cut_start < match_start or cut_end > match_end
                            )
                        modality_quality = {
                            "matched_samples": match.get("matched_samples", 0),
                            "match_ratio": match.get("match_ratio", 0),
                            "mean_hash_distance": match.get("mean_hash_distance", 0),
                            "level": quality_level(
                                int(match.get("duration_seconds", 0)),
                                float(match.get("match_ratio", 0)),
                                float(match.get("mean_hash_distance", 0)),
                                modality,
                            ),
                        }
                        candidates.append({
                            "episode_a": left_path.name,
                            "episode_b": right_path.name,
                            "episode_a_number": left_meta["episode_number"],
                            "episode_b_number": right_meta["episode_number"],
                            "confidence": "candidate",
                            "modalities": [modality],
                            "match_quality": {modality: modality_quality},
                            **match,
                        })

    # Join the visual and audio evidence when both point to the same sequence.
    combined = []
    for candidate in sorted(
        candidates,
        key=lambda item: (
            item["episode_a"], item["episode_b"], item["edge"],
            item["episode_a_offset_seconds"], item["episode_b_offset_seconds"],
        ),
    ):
        modality = candidate["modalities"][0]
        corroborating = next((
            existing for existing in combined
            if existing["episode_a"] == candidate["episode_a"]
            and existing["episode_b"] == candidate["episode_b"]
            and existing["edge"] == candidate["edge"]
            and modality not in existing["modalities"]
            and abs(existing["episode_a_offset_seconds"] - candidate["episode_a_offset_seconds"]) <= 3
            and abs(existing["episode_b_offset_seconds"] - candidate["episode_b_offset_seconds"]) <= 3
            and min(
                existing["episode_a_offset_seconds"] + existing["duration_seconds"],
                candidate["episode_a_offset_seconds"] + candidate["duration_seconds"],
            ) >= max(existing["episode_a_offset_seconds"], candidate["episode_a_offset_seconds"])
        ), None)
        if corroborating is None:
            combined.append(candidate)
            continue

        corroborating["modalities"] = sorted(set(corroborating["modalities"] + candidate["modalities"]))
        corroborating["match_quality"].update(candidate["match_quality"])
        corroborating["duration_seconds"] = max(
            corroborating["duration_seconds"], candidate["duration_seconds"]
        )
        corroborating["confidence"] = "corroborated_candidate"
        for side in ("a", "b"):
            start_key = f"episode_{side}_offset_seconds"
            cut_start_key = f"episode_{side}_cut_start_seconds"
            cut_end_key = f"episode_{side}_cut_end_seconds"
            corroborating[cut_start_key] = min(corroborating[cut_start_key], candidate[cut_start_key])
            corroborating[cut_end_key] = max(corroborating[cut_end_key], candidate[cut_end_key])
            corroborating[f"episode_{side}_boundary_expanded"] = (
                corroborating[cut_start_key] < corroborating[start_key]
                or corroborating[cut_end_key] > corroborating[start_key] + corroborating["duration_seconds"]
            )

    candidates = combined
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
        "audio_warnings": audio_warnings,
        "notes": [
            "Las huellas visuales y las de audio son señales candidatas; confirmar el opening/ending antes de recortar.",
            "Una coincidencia de audio puede ser música de fondo compartida y no implica que deba eliminarse todo ese intervalo.",
            "Si coinciden visual y audio para una secuencia cercana, el informe combina ambas evidencias.",
            "No se modificaron ni subieron los vídeos originales."
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
        report = scan(
            args.folder.expanduser(),
            args.output.expanduser(),
            args.recursive,
            not args.no_cache,
            args.cache_file,
            progress=True,
        )
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
    if report["audio_warnings"]:
        print(f"Advertencias de audio: {len(report['audio_warnings'])}; las coincidencias visuales siguen disponibles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
