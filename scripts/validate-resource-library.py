#!/usr/bin/env python3
"""Validate the reusable asset catalog and local gallery without network access."""
from __future__ import annotations
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
IMAGE_ROOT = ROOT / "recursos" / "imagenes"
PUBLIC_ROOT = (ROOT / "public").resolve()
CATALOG_PATH = ROOT / "recursos" / "catalogo.json"
GALLERY_PATH = ROOT / "public" / "videos" / "gallery.json"
KNOWN_SCENES = {"old", "soul", "baby", "kingdom", "forest", "village", "dragon", "portal"}
IMAGE_EXTENSIONS = {".svg", ".png", ".jpg", ".jpeg", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v"}
MAX_ASSET_BYTES = 2 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024
CANVAS_WIDTH, CANVAS_HEIGHT = 1280, 720


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def validate_svg(path: Path, errors: list[str]) -> None:
    try:
        source = path.read_text(encoding="utf-8")
        lowered = source.lower()
        if any(token in lowered for token in ("<!doctype", "<!entity", "java" + "script:", "@import")):
            errors.append(f"{path.relative_to(ROOT)}: declaración o referencia SVG no permitida")
        root = ET.fromstring(source)
    except (OSError, UnicodeError, ET.ParseError) as exc:
        errors.append(f"{path.relative_to(ROOT)}: SVG ilegible o inválido ({exc})")
        return
    if root.tag.rsplit("}", 1)[-1].lower() != "svg":
        errors.append(f"{path.relative_to(ROOT)}: la raíz XML no es <svg>")
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1].lower() if isinstance(element.tag, str) else ""
        if tag in {"script", "foreignobject"}:
            errors.append(f"{path.relative_to(ROOT)}: elemento SVG activo/no permitido")
        for key, value in element.attrib.items():
            attr = key.rsplit("}", 1)[-1].lower()
            if attr.startswith("on"):
                errors.append(f"{path.relative_to(ROOT)}: atributo de evento no permitido ({attr})")
            if attr == "href" and value and not value.startswith("#") and not value.startswith("data:image/"):
                errors.append(f"{path.relative_to(ROOT)}: referencia externa en href")
            for reference in re.findall(r"url\((.*?)\)", value, flags=re.IGNORECASE):
                cleaned = reference.strip().strip("'").strip('"')
                if not cleaned.startswith("#"):
                    errors.append(f"{path.relative_to(ROOT)}: referencia url() externa")


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: no se pudo leer el catálogo: {exc}")
        return 1
    if not isinstance(catalog, dict) or not isinstance(catalog.get("resources"), list):
        print("ERROR: catalogo.json debe contener una lista resources.")
        return 1

    ids: set[str] = set()
    catalog_paths: set[str] = set()
    digests: dict[str, str] = {}
    registered: set[Path] = set()
    local_count = 0
    for index, item in enumerate(catalog["resources"]):
        label = f"resources[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{label}: entrada no es objeto JSON")
            continue
        rid = item.get("id")
        if not isinstance(rid, str) or not rid.strip():
            errors.append(f"{label}: falta id")
        elif rid in ids:
            errors.append(f"{label}: id duplicado {rid}")
        else:
            ids.add(rid)
        tags = item.get("tags")
        if not isinstance(tags, list) or not tags or not all(isinstance(t, str) and t.strip() for t in tags):
            errors.append(f"{label} ({rid}): tags inválidas")

        kind = item.get("type")
        if kind == "external_pack":
            source = item.get("source")
            parsed = urlsplit(source) if isinstance(source, str) else None
            if not parsed or parsed.scheme != "https" or not parsed.netloc:
                errors.append(f"{label} ({rid}): la fuente externa debe ser HTTPS")
            if not isinstance(item.get("license"), str) or not item["license"].strip():
                errors.append(f"{label} ({rid}): falta licencia declarada")
            status = item.get("status")
            if status not in {"catalogado_pendiente_de_importacion", "por_verificar", "importado"}:
                errors.append(f"{label} ({rid}): estado de importación ausente/desconocido")
            if status == "por_verificar":
                warnings.append(f"{rid}: verificar licencia/contenido antes de importar")
            scenes = item.get("compatible_scenes")
            if not isinstance(scenes, list) or not scenes or any(s != "all" and s not in KNOWN_SCENES for s in scenes):
                errors.append(f"{label} ({rid}): compatible_scenes inválidas")
        elif kind == "image_overlay":
            rel = item.get("path")
            if not isinstance(rel, str) or not rel.strip():
                errors.append(f"{label} ({rid}): falta path")
                continue
            rel_path = Path(rel)
            if rel_path.is_absolute() or ".." in rel_path.parts:
                errors.append(f"{label} ({rid}): ruta absoluta/traversal no permitida")
                continue
            asset = (ROOT / rel_path).resolve()
            if not is_within(asset, ROOT.resolve()) or not asset.is_file():
                errors.append(f"{label} ({rid}): ruta local rota o externa ({rel})")
                continue
            if asset.suffix.lower() not in IMAGE_EXTENSIONS:
                errors.append(f"{label} ({rid}): extensión no admitida")
                continue
            if rel in catalog_paths:
                errors.append(f"{label} ({rid}): ruta duplicada ({rel})")
            catalog_paths.add(rel)
            size = asset.stat().st_size
            if size <= 0 or size > MAX_ASSET_BYTES:
                errors.append(f"{label} ({rid}): tamaño inválido ({size} bytes)")
            digest = hashlib.sha256(asset.read_bytes()).hexdigest()
            if digest in digests:
                errors.append(f"{label} ({rid}): contenido duplicado con {digests[digest]}")
            else:
                digests[digest] = rel
            registered.add(asset)
            local_count += 1
            for field in ("license", "provenance"):
                if not isinstance(item.get(field), str) or not item[field].strip():
                    errors.append(f"{label} ({rid}): falta {field}")
            scenes = item.get("scenes")
            if not isinstance(scenes, list) or not scenes or any(s != "all" and s not in KNOWN_SCENES for s in scenes):
                errors.append(f"{label} ({rid}): scenes inválidas")
            x, y, width, height = (item.get(k) for k in ("x", "y", "width", "height"))
            values = (x, y, width, height)
            numbers_ok = all(isinstance(v, int) and not isinstance(v, bool) for v in values)
            if (not numbers_ok or x < 0 or y < 0 or width <= 0 or height <= 0
                    or x + width > CANVAS_WIDTH or y + height > CANVAS_HEIGHT):
                errors.append(f"{label} ({rid}): dimensiones/coordenadas fuera de 1280x720")
            if asset.suffix.lower() == ".svg":
                validate_svg(asset, errors)
        else:
            errors.append(f"{label} ({rid}): tipo desconocido {kind!r}")

    for asset in IMAGE_ROOT.rglob("*") if IMAGE_ROOT.exists() else []:
        if asset.is_file() and asset.suffix.lower() in IMAGE_EXTENSIONS and asset.resolve() not in registered:
            errors.append(f"Imagen local sin registrar: {asset.relative_to(ROOT)}")

    try:
        gallery = json.loads(GALLERY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"No se pudo leer la galería: {exc}")
        gallery = []
    if not isinstance(gallery, list):
        errors.append("gallery.json debe ser una lista")
        gallery = []
    gallery_paths: set[str] = set()
    for index, entry in enumerate(gallery):
        if not isinstance(entry, dict) or not isinstance(entry.get("src"), str):
            errors.append(f"gallery.json[{index}]: entrada/src inválido")
            continue
        if "duration_seconds" in entry:
            duration = entry["duration_seconds"]
            if isinstance(duration, bool) or not isinstance(duration, (int, float)) or duration <= 0:
                errors.append(f"gallery.json[{index}]: duration_seconds inválido")
        parsed = urlsplit(entry["src"])
        if (parsed.scheme or parsed.netloc or parsed.path.startswith("/")
                or "\\" in parsed.path or ".." in Path(parsed.path).parts):
            errors.append(f"gallery.json[{index}]: src debe ser ruta relativa local")
            continue
        normalized = Path(parsed.path).as_posix().removeprefix("./")
        if normalized in gallery_paths:
            errors.append(f"gallery.json: ruta duplicada aunque cambie la query ({normalized})")
        gallery_paths.add(normalized)
        target = (PUBLIC_ROOT / normalized).resolve()
        if not is_within(target, PUBLIC_ROOT) or not target.is_file():
            errors.append(f"gallery.json[{index}]: archivo inexistente ({entry['src']})")

    video_count = 0
    videos_dir = ROOT / "public" / "videos"
    for video in videos_dir.iterdir() if videos_dir.exists() else []:
        if video.is_file() and video.suffix.lower() in VIDEO_EXTENSIONS:
            video_count += 1
            relative = video.relative_to(PUBLIC_ROOT).as_posix()
            if relative not in gallery_paths:
                errors.append(f"Video final sin entrada de galería: {relative}")
            if video.stat().st_size > MAX_VIDEO_BYTES:
                warnings.append(f"{relative}: archivo grande para GitHub ({video.stat().st_size} bytes)")
            print(f"Video: {relative} — {video.stat().st_size:,} bytes")
    for file in (ROOT / "recursos").rglob("*"):
        if file.is_file() and file.suffix.lower() in VIDEO_EXTENSIONS:
            errors.append(f"Video final mezclado en recursos/: {file.relative_to(ROOT)}")

    for warning in warnings:
        print(f"AVISO: {warning}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"Validación fallida: {len(errors)} error(es).")
        return 1
    print(f"Validación OK: {len(ids)} recursos, {local_count} imágenes locales, {video_count} videos en galería.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
