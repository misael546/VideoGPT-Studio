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
MAX_HASH_DISTANCE = 64  # 25% of a 16x16 average hash


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
    runs = []
    active_start = None
    active_length = 0
    limit = min(len(left), len(right))
    for i in range(limit):
        if (left[i] ^ right[i]).bit_count() <= MAX_HASH_DISTANCE:
            if active_start is None:
                active_start = i
            active_length += 1
        else:
            if active_length >= MIN_MATCH_SECONDS:
                runs.append({"edge": edge, "offset_seconds": active_start, "duration_seconds": active_length})
            active_start, active_length = None, 0
    if active_length >= MIN_MATCH_SECONDS:
        runs.append({"edge": edge, "offset_seconds": active_start, "duration_seconds": active_length})
    return runs


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
            left_meta = next(v for v in videos if v["filename"] == left_path.name)
            right_meta = next(v for v in videos if v["filename"] == right_path.name)
            for edge in ("start", "end"):
                a = hashes[left_path].get(edge, [])
                b = hashes[right_path].get(edge, [])
                for match in matching_runs(a, b, edge):
                    candidates.append({
                        "episode_a": left_path.name,
                        "episode_b": right_path.name,
                        "episode_a_number": left_meta["episode_number"],
                        "episode_b_number": right_meta["episode_number"],
                        "confidence": "candidate",
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
