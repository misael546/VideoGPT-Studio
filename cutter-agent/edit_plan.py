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


def _quality_score(value: object) -> tuple:
    if not isinstance(value, dict):
        return (0, 0.0, -999.0)
    level = {"low": 1, "medium": 2, "high": 3}.get(str(value.get("level", "")).lower(), 0)
    try:
        ratio = float(value.get("match_ratio") or 0)
    except (TypeError, ValueError):
        ratio = 0.0
    try:
        distance = float(value.get("mean_hash_distance") or 999)
    except (TypeError, ValueError):
        distance = 999.0
    return (level, ratio, -distance)


def _source_pairs(cut: dict) -> list[list[str]]:
    pairs = cut.get("source_pairs")
    if not isinstance(pairs, list):
        pair = cut.get("source_pair")
        pairs = [pair] if isinstance(pair, list) else []
    result = []
    seen = set()
    for pair in pairs:
        if not isinstance(pair, list) or len(pair) != 2:
            continue
        normalized = [str(pair[0]), str(pair[1])]
        key = tuple(normalized)
        if key not in seen:
            seen.add(key)
            result.append(normalized)
    return result


def _merge_cut_quality(existing: dict, incoming: dict) -> None:
    left = existing.get("match_quality", {})
    right = incoming.get("match_quality", {})
    if not isinstance(left, dict):
        left = {}
    if not isinstance(right, dict):
        right = {}
    modalities = set(existing.get("modalities", [])) | set(incoming.get("modalities", []))
    if not modalities:
        existing["match_quality"] = max((left, right), key=_quality_score)
        return

    merged = {}
    for modality in modalities:
        candidates = [item for item in (left.get(modality), right.get(modality)) if isinstance(item, dict)]
        if candidates:
            merged[modality] = max(candidates, key=_quality_score)
    existing["match_quality"] = merged


def _same_cut_candidate(left: dict, right: dict) -> bool:
    left_start = float(left["start_seconds"])
    left_end = float(left["end_seconds"])
    right_start = float(right["start_seconds"])
    right_end = float(right["end_seconds"])
    start_delta = abs(left_start - right_start)
    end_delta = abs(left_end - right_end)
    intersection = max(0.0, min(left_end, right_end) - max(left_start, right_start))
    shorter = min(left_end - left_start, right_end - right_start)
    overlap_ratio = intersection / shorter if shorter > 0 else 0.0

    # Pairwise comparisons for one repeated intro/outro often produce slightly different
    # boundaries. Merge only close, strongly overlapping candidates, not separate scenes.
    same_edge = left.get("edge") == right.get("edge")
    if start_delta <= 4.0 and end_delta <= 20.0 and overlap_ratio >= 0.75:
        return True
    return same_edge and start_delta <= 12.0 and overlap_ratio >= 0.70


def _deduplicate_episode_cuts(cuts: list[dict]) -> list[dict]:
    grouped = []
    for cut in sorted(cuts, key=lambda item: (item["start_seconds"], item["end_seconds"], item["id"])):
        duplicate = next((item for item in reversed(grouped) if _same_cut_candidate(item, cut)), None)
        if duplicate is None:
            clone = dict(cut)
            clone["modalities"] = sorted(set(clone.get("modalities", [])))
            clone["source_pairs"] = _source_pairs(clone)
            if not clone.get("source_pair") and clone["source_pairs"]:
                clone["source_pair"] = clone["source_pairs"][0]
            grouped.append(clone)
            continue

        duplicate["start_seconds"] = round(min(duplicate["start_seconds"], cut["start_seconds"]), 3)
        duplicate["end_seconds"] = round(max(duplicate["end_seconds"], cut["end_seconds"]), 3)
        duplicate["modalities"] = sorted(set(duplicate.get("modalities", [])) | set(cut.get("modalities", [])))
        pair_list = _source_pairs(duplicate) + _source_pairs(cut)
        seen = set()
        duplicate["source_pairs"] = [
            pair for pair in pair_list
            if tuple(pair) not in seen and not seen.add(tuple(pair))
        ]
        if duplicate["source_pairs"]:
            duplicate["source_pair"] = duplicate["source_pairs"][0]
        _merge_cut_quality(duplicate, cut)
        duplicate["boundary_expanded"] = bool(
            duplicate.get("boundary_expanded") or cut.get("boundary_expanded")
        )
        if abs(int(cut.get("alignment_shift_seconds") or 0)) < abs(int(duplicate.get("alignment_shift_seconds") or 0)):
            duplicate["alignment_shift_seconds"] = int(cut.get("alignment_shift_seconds") or 0)
        # Candidate cuts are never auto-approved, including after grouping.
        duplicate["approved"] = False
        duplicate["review_status"] = "pending"

    return grouped


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

    scan_warnings = []
    for error in scan.get("errors", []):
        if isinstance(error, dict):
            scan_warnings.append({
                "type": "video_error",
                "filename": str(error.get("filename", "")),
                "message": str(error.get("error", "No se pudo analizar el vídeo.")),
            })
    for warning in scan.get("audio_warnings", []):
        if isinstance(warning, dict):
            scan_warnings.append({
                "type": "audio_warning",
                "filename": str(warning.get("filename", "")),
                "edge": str(warning.get("edge", "")),
                "message": str(warning.get("error", "No se pudo extraer la huella de audio.")),
            })

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
            start = max(0.0, float(match.get(f"episode_{side}_cut_start_seconds", offset)))
            end = min(
                episode["duration_seconds"],
                float(match.get(f"episode_{side}_cut_end_seconds", offset + duration)),
            )
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
                "modalities": list(match.get("modalities", [])),
                "match_quality": match.get("match_quality", {}),
                "boundary_expanded": bool(match.get(f"episode_{side}_boundary_expanded", False)),
                "review_status": "pending",
                "approved": False,
            })

    candidate_count = 0
    for episode in episodes:
        episode["cuts"] = _deduplicate_episode_cuts(episode["cuts"])
        episode["cuts"].sort(key=lambda cut: (cut["start_seconds"], cut["end_seconds"], cut["id"]))
        for cut in episode["cuts"]:
            candidate_count += 1
            cut["id"] = f"C{candidate_count:05d}"
            cut["approved"] = False
            cut["review_status"] = "pending"

    return {
        "schema": PLAN_SCHEMA,
        "source_report": str(scan_path.expanduser().resolve()),
        "scan_warnings": scan_warnings,
        "episodes": episodes,
        "summary": {
            "episode_count": len(episodes),
            "cut_candidates": candidate_count,
            "approved_cut_count": 0,
            "pending_review_count": candidate_count,
        },
        "review_instructions": [
            "Cada intervalo es una coincidencia visual y/o de audio candidata, no una detección confirmada de opening o ending.",
            "Una coincidencia solo de audio puede ser música de fondo; revisa el vídeo y el audio antes de aprobarla.",
            "Cuando aparezcan ambas modalidades, son señales concordantes, pero el corte sigue requiriendo revisión manual.",
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
