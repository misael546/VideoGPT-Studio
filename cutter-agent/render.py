#!/usr/bin/env python3
"""Render an explicitly reviewed local episode manifest into one MP4."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"}
WATERMARK_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def command(args: list[str], *, capture: bool = False) -> str:
    result = subprocess.run(
        args,
        stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=False,
        text=not capture,
    )
    if result.returncode:
        error = result.stderr if isinstance(result.stderr, str) else result.stderr.decode("utf-8", "replace")
        raise RuntimeError(f"Falló FFmpeg/FFprobe: {error[-1500:]}")
    if capture:
        return result.stdout.decode("utf-8", "replace")
    return ""


def media_info(path: Path) -> dict:
    raw = command([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type", "-of", "json", str(path),
    ], capture=True)
    data = json.loads(raw)
    return {
        "duration": float((data.get("format") or {}).get("duration") or 0),
        "has_audio": any(s.get("codec_type") == "audio" for s in data.get("streams", [])),
    }


def load_manifest(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != "cutter-studio-render/v1":
        raise ValueError("El manifiesto debe usar schema cutter-studio-render/v1.")
    episodes = data.get("episodes")
    if not isinstance(episodes, list) or not episodes:
        raise ValueError("El manifiesto necesita una lista 'episodes' no vacía.")
    result = []
    for index, item in enumerate(episodes, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Episodio #{index}: entrada inválida.")
        source = Path(str(item.get("path", ""))).expanduser()
        if not source.is_file() or source.suffix.lower() not in VIDEO_EXTENSIONS:
            raise ValueError(f"Episodio #{index}: ruta de vídeo inexistente o extensión no admitida: {source}")
        try:
            start = float(item["start_seconds"])
            end = float(item["end_seconds"])
        except (KeyError, TypeError, ValueError):
            raise ValueError(f"Episodio #{index}: define start_seconds y end_seconds numéricos.")
        if start < 0 or end <= start:
            raise ValueError(f"Episodio #{index}: el intervalo debe cumplir 0 <= inicio < fin.")
        info = media_info(source)
        if end > info["duration"] + 0.05:
            raise ValueError(f"Episodio #{index}: el final ({end}s) supera la duración ({info['duration']:.3f}s).")
        result.append({
            "path": source.resolve(),
            "start": start,
            "end": min(end, info["duration"]),
            "duration": min(end, info["duration"]) - start,
            "has_audio": info["has_audio"],
        })
    return result


def render(manifest: Path, output: Path, watermark: Path | None = None, overwrite: bool = False) -> Path:
    missing = [tool for tool in ("ffmpeg", "ffprobe") if shutil.which(tool) is None]
    if missing:
        raise RuntimeError("Faltan dependencias en PATH: " + ", ".join(missing))
    if not manifest.is_file():
        raise ValueError(f"No existe el manifiesto: {manifest}")
    output = output.expanduser().resolve()
    if output.suffix.lower() != ".mp4":
        raise ValueError("La salida debe tener extensión .mp4.")
    if output.exists() and not overwrite:
        raise FileExistsError(f"La salida ya existe; no se sobrescribió: {output}")
    if watermark is not None:
        watermark = watermark.expanduser().resolve()
        if not watermark.is_file() or watermark.suffix.lower() not in WATERMARK_EXTENSIONS:
            raise ValueError("La marca de agua debe ser un archivo PNG, JPG o WebP existente.")
    episodes = load_manifest(manifest.expanduser())
    output.parent.mkdir(parents=True, exist_ok=True)

    # All work is staged in a temporary directory. Originals are read-only and never edited.
    with tempfile.TemporaryDirectory(prefix="cutter-studio-", dir=output.parent) as temp_name:
        temp = Path(temp_name)
        rendered = []
        for index, episode in enumerate(episodes, start=1):
            segment = temp / f"segment_{index:04d}.mp4"
            args = [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-ss", f"{episode['start']:.3f}", "-i", str(episode["path"]),
            ]
            watermark_index = None
            if watermark is not None:
                watermark_index = 1
                args += ["-loop", "1", "-i", str(watermark)]
            silent_index = None
            if not episode["has_audio"]:
                silent_index = 2 if watermark is not None else 1
                args += [
                    "-f", "lavfi", "-t", f"{episode['duration']:.3f}",
                    "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                ]

            args += ["-t", f"{episode['duration']:.3f}"]
            base_filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p"
            if watermark_index is not None:
                args += [
                    "-filter_complex",
                    f"[0:v]{base_filter}[base];[base][{watermark_index}:v]overlay=W-w-24:H-h-24:shortest=1[v]",
                    "-map", "[v]",
                ]
            else:
                args += ["-vf", base_filter, "-map", "0:v:0"]
            audio_input = silent_index if silent_index is not None else 0
            audio_map = f"{audio_input}:a:0" if silent_index is not None else "0:a:0?"
            args += [
                "-map", audio_map,
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                "-ac", "2", "-af", "apad", "-t", f"{episode['duration']:.3f}",
                "-movflags", "+faststart", str(segment),
            ]
            command(args)
            rendered.append(segment)

        concat_file = temp / "concat.txt"
        concat_file.write_text(
            "".join(f"file '{p.name}'\n" for p in rendered),
            encoding="utf-8",
        )
        staged_output = temp / "final.mp4"
        command([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c", "copy", "-movflags", "+faststart", str(staged_output),
        ])
        # Copy only after a complete successful render; preserve an existing output unless overwrite was explicit.
        if output.exists() and not overwrite:
            raise FileExistsError(f"La salida apareció durante el proceso: {output}")
        os.replace(staged_output, output)
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Cutter Studio: renderizado local desde un plan revisado.")
    parser.add_argument("manifest", type=Path, help="JSON con cortes aprobados y orden de episodios.")
    parser.add_argument("--output", type=Path, required=True, help="MP4 final; no se sobrescribe por defecto.")
    parser.add_argument("--watermark", type=Path, help="Imagen PNG/JPG/WebP opcional.")
    parser.add_argument("--overwrite", action="store_true", help="Permite reemplazar la salida indicada.")
    args = parser.parse_args()
    try:
        result = render(args.manifest, args.output, args.watermark, args.overwrite)
    except (ValueError, OSError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"Vídeo creado localmente: {result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
