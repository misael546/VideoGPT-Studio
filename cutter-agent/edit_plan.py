#!/usr/bin/env python3
"""Turn scan candidates into a reviewable edit plan and approved render manifest."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


PLAN_SCHEMA = "cutter-studio-edit-plan/v1"
RENDER_SCHEMA = "cutter-studio-render/v1"


def read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON inválido en {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"El archivo debe contener un objeto JSON: {path}")
    return value


def create_plan(scan_path: Path) -> dict:
    scan = read_json(scan_path)
    if scan.get("schema") != "cutter-studio-scan/v1":
        raise ValueError("El archivo de entrada no es un informe cutter-studio-scan/v1.")
    videos = scan.get("videos_in_proposed_order")
    candidates = scan.get("repeated_sequence_candidates")
    if not isinstance(videos, list) or not videos:
        raise ValueError("El informe no contiene vídeos para ordenar.")
    if not isinstance(candidates, list):
        raise ValueError("El informe no contiene repeated_sequence_candidates válidas.")

    episodes = []
    by_filename = {}
    for order, video in enumerate(videos, start=1):
        if not isinstance(video, dict) or not video.get("path"):
            raise ValueError(f"Entrada de vídeo inválida en la posición {order}.")
        duration = float(video.get("duration_seconds") or 0)
        if duration <= 0:
            raise ValueError(f"Duración inválida para {video.get('filename', video.get('path'))}.")
        episode = {
            "order": order,
            "path": str(Path(video["path"]).expanduser().resolve()),
            "filename": str(video.get("filename") or Path(video["path"]).name),
            "episode_number": video.get("episode_number"),
            "duration_seconds": duration,
            "cuts": [],
        }
        episodes.append(episode)
        by_filename.setdefault(episode["filename"], []).append(episode)

    candidate_count = 0
    for match in candidates:
        if not isinstance(match, dict):
            continue
        edge = match.get("edge")
        if edge not in ("start", "end"):
            continue
        duration = float(match.get("duration_seconds") or 0)
        if duration < 1:
            continue
        for side in ("a", "b"):
            filename = match.get(f"episode_{side}")
            offset = float(match.get(f"episode_{side}_offset_seconds") or 0)
            possible = by_filename.get(str(filename), [])
            if len(possible) != 1:
                # Ambiguous duplicate filenames should never silently target a wrong source.
                continue
            episode = possible[0]
            start = max(0.0, offset)
            end = min(episode["duration_seconds"], offset + duration)
            if end <= start:
                continue
            candidate_count += 1
            episode["cuts"].append({
                "id": f"C{candidate_count:05d}",
                "edge": edge,
                "start_seconds": round(start, 3),
                "end_seconds": round(end, 3),
                "source_pair": [
                    str(match.get("episode_a", "")),
                    str(match.get("episode_b", "")),
                ],
                "alignment_shift_seconds": int(match.get("alignment_shift_seconds") or 0),
                "review_status": "pending",
                "approved": False,
            })

    for episode in episodes:
        episode["cuts"].sort(key=lambda cut: (cut["start_seconds"], cut["end_seconds"], cut["id"]))

    return {
        "schema": PLAN_SCHEMA,
        "source_report": str(scan_path.expanduser().resolve()),
        "episodes": episodes,
        "summary": {
            "episode_count": len(episodes),
            "cut_candidates": candidate_count,
            "approved_cut_count": 0,
            "pending_review_count": candidate_count,
        },
        "review_instructions": [
            "Cada intervalo es solo una coincidencia visual candidata, no una detección confirmada de opening o ending.",
            "Reproduce el vídeo en esos tiempos antes de cambiar approved a true.",
            "Los intervalos aprobados se eliminarán; los no aprobados se conservarán.",
            "Guarda el archivo edit-plan.json revisado antes de generar el manifiesto de renderizado.",
        ],
    }


def build_render_manifest(plan: dict) -> dict:
    if plan.get("schema") != PLAN_SCHEMA:
        raise ValueError(f"El plan debe usar schema {PLAN_SCHEMA}.")
    episodes = plan.get("episodes")
    if not isinstance(episodes, list) or not episodes:
        raise ValueError("El plan necesita una lista episodes no vacía.")
    render_episodes = []
    for episode_index, episode in enumerate(episodes, start=1):
        if not isinstance(episode, dict) or not episode.get("path"):
            raise ValueError(f"Episodio #{episode_index}: entrada inválida.")
        duration = float(episode.get("duration_seconds") or 0)
        if duration <= 0:
            raise ValueError(f"Episodio #{episode_index}: duración inválida.")
        intervals = []
        for cut in episode.get("cuts", []):
            if not isinstance(cut, dict):
                raise ValueError(f"Episodio #{episode_index}: candidato de corte inválido.")
            if cut.get("approved") is not True:
                continue
            try:
                start = float(cut["start_seconds"])
                end = float(cut["end_seconds"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(f"Corte {cut.get('id', '?')}: intervalo inválido.") from exc
            if start < 0 or end <= start or end > duration + 0.05:
                raise ValueError(f"Corte {cut.get('id', '?')}: intervalo fuera de la duración del episodio.")
            intervals.append((max(0.0, start), min(duration, end)))

        # Merge overlapping approved cuts to prevent negative or duplicated keep segments.
        intervals.sort()
        merged = []
        for start, end in intervals:
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end))
            else:
                merged.append((start, end))

        cursor = 0.0
        kept = []
        for start, end in merged:
            if start > cursor:
                kept.append((cursor, start))
            cursor = max(cursor, end)
        if cursor < duration:
            kept.append((cursor, duration))
        kept = [(start, end) for start, end in kept if end - start >= 0.05]
        if not kept:
            raise ValueError(f"Episodio #{episode_index}: los cortes aprobados eliminarían todo el episodio.")

        for start, end in kept:
            render_episodes.append({
                "path": str(Path(episode["path"]).expanduser().resolve()),
                "start_seconds": round(start, 3),
                "end_seconds": round(end, 3),
            })

    return {
        "schema": RENDER_SCHEMA,
        "source_edit_plan": plan.get("source_report"),
        "episodes": render_episodes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Cutter Studio: plan de edición con aprobación manual.")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create", help="Crear un plan revisable desde el informe del escáner.")
    create.add_argument("scan_report", type=Path)
    create.add_argument("--output", type=Path, required=True)
    convert = sub.add_parser("render-manifest", help="Convertir solo cortes aprobados en un manifiesto de renderizado.")
    convert.add_argument("edit_plan", type=Path)
    convert.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "create":
            result = create_plan(args.scan_report)
        else:
            result = build_render_manifest(read_json(args.edit_plan))
        args.output.expanduser().parent.mkdir(parents=True, exist_ok=True)
        args.output.expanduser().write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    except (ValueError, OSError, TypeError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"Archivo creado: {args.output.expanduser().resolve()}")
    if args.command == "create":
        print(f"Episodios: {result['summary']['episode_count']}; cortes candidatos pendientes: {result['summary']['pending_review_count']}")
    else:
        print(f"Segmentos conservados para renderizar: {len(result['episodes'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
