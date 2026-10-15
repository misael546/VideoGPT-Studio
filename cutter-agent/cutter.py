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
MAX_HASH_DISTANCE = 42  # 16.4% of a 16x16 average hash
MAX_CONSECUTIVE_MISSES = 2
MAX_ALIGNMENT_SHIFT_SECONDS = 15


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
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "format=duration,size:stream=width,height",
        "-of", "json", str(path),
    ])
    data = json.loads(raw)
    stream = (data.get("streams") or [{}])[0]
    fmt = data.get("format") or {}
    return {
        "duration_seconds": round(float(fmt.get("duration") or 0), 3),
        "width": stream.get("width"),
        "height": stream.get("height"),
        "size_bytes": int(fmt.get("size") or path.stat().st_size),
    }


def frame_hashes(path: Path, duration: float, edge: str) -> list[int]:
    if duration <= 0:
        return []
    count = min(WINDOW_SECONDS, max(1, int(duration)))
    # Extract one small grayscale frame per second. Raw frames never leave this process.
    if edge == "start":
        seek = 0
        vf = f"fps=1,scale=16:16:flags=area,format=gray"
    else:
        seek = max(0, duration - count)
        vf = f"fps=1,scale=16:16:flags=area,format=gray"
    raw = run([
        "ffmpeg", "-v", "error", "-ss", str(seek), "-i", str(path),
        "-t", str(count), "-vf", vf, "-an", "-sn", "-f", "rawvideo",
        "-pix_fmt", "gray", "pipe:1",
    ], binary=True)
    frame_size = 16 * 16
    hashes = []
    for offset in range(0, len(raw) - frame_size + 1, frame_size):
        pixels = raw[offset:offset + frame_size]
        avg = sum(pixels) / frame_size
        value = 0
        for pixel in pixels:
            value = (value << 1) | int(pixel >= avg)
        hashes.append(value)
    return hashes


def matching_runs(left: list[int], right: list[int], edge: str) -> list[dict]:
    """Align sampled frames and tolerate up to two isolated visual mismatches."""
    if not left or not right:
        return []

    candidates = []
    max_shift = min(MAX_ALIGNMENT_SHIFT_SECONDS, max(len(left), len(right)) - 1)
    for shift in range(-max_shift, max_shift + 1):
        left_start = max(0, shift)
        right_start = max(0, -shift)
        limit = min(len(left) - left_start, len(right) - right_start)
        if limit < MIN_MATCH_SECONDS:
            continue

        run_start = None
        last_match = None
        miss_count = 0
        distances = []
        for index in range(limit):
            distance = (left[left_start + index] ^ right[right_start + index]).bit_count()
            if distance <= MAX_HASH_DISTANCE:
                if run_start is None:
                    run_start = index
                last_match = index
                miss_count = 0
                distances.append(distance)
            elif run_start is not None:
                miss_count += 1
                if miss_count > MAX_CONSECUTIVE_MISSES:
                    run_length = last_match - run_start + 1
                    if run_length >= MIN_MATCH_SECONDS:
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
            if run_length >= MIN_MATCH_SECONDS:
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
            item["duration_seconds"] * item.get("match_ratio", 0),
            item["duration_seconds"],
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


def scan(folder: Path, output: Path, recursive: bool = False) -> dict:
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
    for path in paths:
        try:
            meta = probe(path)
            number = episode_number(path)
            entry = {
                "filename": path.name,
                "path": str(path.resolve()),
                "episode_number": number,
                **meta,
            }
            videos.append(entry)
            hashes[path] = {}
            if meta["duration_seconds"] >= MIN_MATCH_SECONDS:
                hashes[path]["start"] = frame_hashes(path, meta["duration_seconds"], "start")
                hashes[path]["end"] = frame_hashes(path, meta["duration_seconds"], "end")
        except (RuntimeError, ValueError, OSError, json.JSONDecodeError) as exc:
            errors.append({"filename": path.name, "error": str(exc)})
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
                            "mean_hash_distance": match.get("mean_hash_distance", 256),
                        },
                        **match,
                    })
    report = {
        "schema": "cutter-studio-scan/v1",
        "source_folder": str(folder.resolve()),
        "video_count": len(videos),
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
    args = parser.parse_args()

    missing = [tool for tool in ("ffmpeg", "ffprobe") if shutil.which(tool) is None]
    if missing:
        print("Faltan dependencias en PATH: " + ", ".join(missing), file=sys.stderr)
        return 2
    try:
        report = scan(args.folder.expanduser(), args.output.expanduser(), args.recursive)
    except (ValueError, RuntimeError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"Vídeos analizados: {report['video_count']}")
    print(f"Candidatas a opening/ending: {len(report['repeated_sequence_candidates'])}")
    print(f"Informe local: {args.output.resolve()}")
    if report["errors"]:
        print(f"Archivos con error: {len(report['errors'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
