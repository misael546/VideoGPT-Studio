#!/usr/bin/env python3
"""Loopback-only review server for Cutter Studio. Media never leaves this computer."""
from __future__ import annotations

import argparse
import hashlib
import math
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"}
MAX_PLAN_BYTES = 10 * 1024 * 1024
MAX_PREVIEW_SECONDS = 180.0
PREVIEW_CONTEXT_SECONDS = 4.0


def parse_byte_range(range_header: str | None, total_size: int) -> tuple[int, int] | None:
    """Parse one RFC 7233 byte range; reject malformed or multiple ranges."""
    if range_header is None or not range_header.strip():
        return None
    if total_size <= 0:
        raise ValueError("El vídeo no contiene bytes para servir.")
    value = range_header.strip()
    if not value.startswith("bytes="):
        raise ValueError("Unidad de rango no admitida.")
    ranges = value[6:].split(",")
    if len(ranges) != 1:
        raise ValueError("Solo se admite un rango de bytes por solicitud.")
    match = re.fullmatch(r"(\d*)-(\d*)", ranges[0].strip())
    if not match or not (match.group(1) or match.group(2)):
        raise ValueError("Formato de rango de bytes no válido.")

    if match.group(1):
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else total_size - 1
        if start >= total_size or end < start:
            raise ValueError("Rango de bytes fuera del vídeo.")
        return start, min(end, total_size - 1)

    suffix_length = int(match.group(2))
    if suffix_length <= 0:
        raise ValueError("La longitud del rango de bytes debe ser positiva.")
    return max(0, total_size - suffix_length), total_size - 1


def is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def active_plan_path(plan_path: Path) -> Path:
    reviewed = plan_path.with_name("edit-plan-reviewed.json")
    if reviewed.resolve() != plan_path.resolve() and reviewed.is_file():
        try:
            if reviewed.stat().st_mtime_ns >= plan_path.stat().st_mtime_ns:
                return reviewed
        except OSError:
            pass
    return plan_path


def load_plan(plan_path: Path, root: Path) -> dict:
    selected = active_plan_path(plan_path)
    data = json.loads(selected.read_text(encoding="utf-8"))
    validate_plan(data, root)
    return data


def validate_plan(data: object, root: Path) -> dict:
    if not isinstance(data, dict) or data.get("schema") != "cutter-studio-edit-plan/v1":
        raise ValueError("El plan debe usar cutter-studio-edit-plan/v1.")
    episodes = data.get("episodes")
    if not isinstance(episodes, list) or not episodes:
        raise ValueError("El plan necesita episodios.")
    for index, episode in enumerate(episodes, start=1):
        if not isinstance(episode, dict) or not episode.get("path"):
            raise ValueError(f"Episodio #{index}: entrada inválida.")
        path = Path(str(episode["path"])).expanduser().resolve()
        if not is_within(path, root):
            raise ValueError(f"Episodio #{index}: el vídeo no está dentro de la carpeta autorizada.")
        if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
            raise ValueError(f"Episodio #{index}: vídeo inexistente o extensión no admitida.")
        try:
            duration = float(episode.get("duration_seconds"))
        except (TypeError, ValueError):
            raise ValueError(f"Episodio #{index}: duración no válida.") from None
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError(f"Episodio #{index}: duración no válida.")
        cuts = episode.get("cuts")
        if not isinstance(cuts, list):
            raise ValueError(f"Episodio #{index}: lista de cortes no válida.")
        for cut_index, cut in enumerate(cuts, start=1):
            if not isinstance(cut, dict):
                raise ValueError(f"Episodio #{index}, corte #{cut_index}: entrada inválida.")
            try:
                start = float(cut["start_seconds"])
                end = float(cut["end_seconds"])
            except (KeyError, TypeError, ValueError):
                raise ValueError(f"Episodio #{index}, corte #{cut_index}: tiempos no válidos.") from None
            if (
                not math.isfinite(start)
                or not math.isfinite(end)
                or start < 0
                or end <= start
                or end > duration + 0.05
            ):
                raise ValueError(f"Episodio #{index}, corte #{cut_index}: intervalo fuera de la duración.")
            if cut.get("approved") is True and cut.get("review_status") == "rejected":
                raise ValueError(f"Episodio #{index}, corte #{cut_index}: estado de aprobación contradictorio.")
    return data


def preview_episode_index(episodes: list[dict], requested_index: int, requested_path: str | None, root: Path) -> int:
    """Resolve a preview by its source path when supplied so client-side reordering is safe."""
    if requested_path:
        try:
            resolved_requested = Path(requested_path).expanduser().resolve()
        except (OSError, RuntimeError, ValueError) as exc:
            raise ValueError("La ruta del episodio no es válida.") from exc
        if not is_within(resolved_requested, root):
            raise ValueError("La ruta de previsualización está fuera de la carpeta autorizada.")
        for index, episode in enumerate(episodes):
            try:
                candidate = Path(str(episode.get("path", ""))).expanduser().resolve()
            except (OSError, RuntimeError, ValueError):
                continue
            if candidate == resolved_requested:
                return index
        raise ValueError("La ruta solicitada no corresponde a un episodio del plan cargado.")

    if requested_index < 0 or requested_index >= len(episodes):
        raise ValueError("Episodio fuera del plan.")
    return requested_index


def build_handler(root: Path, plan_path: Path, preview_dir: Path):
    class ReviewHandler(BaseHTTPRequestHandler):
        server_version = "CutterStudioLocal/1.0"

        def log_message(self, fmt, *args):
            print("[Cutter Studio] " + (fmt % args))

        def send_bytes(self, status: int, payload: bytes, content_type: str):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; "
                "media-src 'self' blob:; img-src 'self' data: blob:; object-src 'none'; "
                "base-uri 'none'; frame-ancestors 'none'",
            )
            self.end_headers()
            self.wfile.write(payload)

        def send_json(self, status: int, value: dict):
            self.send_bytes(status, json.dumps(value, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

        def origin_allowed(self) -> bool:
            expected_authority = f"127.0.0.1:{self.server.server_port}"
            if self.headers.get("Host") != expected_authority:
                return False
            fetch_site = self.headers.get("Sec-Fetch-Site")
            if fetch_site and fetch_site not in ("same-origin", "none"):
                return False
            origin = self.headers.get("Origin")
            expected_origin = f"http://{expected_authority}"
            return origin in (None, expected_origin)

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/") and not self.origin_allowed():
                self.send_json(403, {"error": "Origen no autorizado."})
                return
            if parsed.path == "/api/plan":
                try:
                    plan = load_plan(plan_path, root)
                except (OSError, json.JSONDecodeError, ValueError) as exc:
                    self.send_json(400, {"error": str(exc)})
                    return
                self.send_json(200, plan)
                return

            if parsed.path == "/api/preview":
                self.serve_preview(parse_qs(parsed.query))
                return

            static_files = {
                "/": ("review.html", "text/html; charset=utf-8"),
                "/review.html": ("review.html", "text/html; charset=utf-8"),
                "/review.js": ("review.js", "text/javascript; charset=utf-8"),
                "/episode-order.js": ("episode-order.js", "text/javascript; charset=utf-8"),
                "/review.css": ("review.css", "text/css; charset=utf-8"),
            }
            if parsed.path not in static_files:
                self.send_json(404, {"error": "No encontrado."})
                return
            filename, content_type = static_files[parsed.path]
            try:
                content = (Path(__file__).resolve().parent / filename).read_bytes()
            except OSError:
                self.send_json(500, {"error": "No se pudo leer el recurso local."})
                return
            self.send_bytes(200, content, content_type)

        def serve_preview(self, query: dict):
            try:
                episode_index = int(query.get("episode", [""])[0])
                start = float(query.get("start", [""])[0])
                end = float(query.get("end", [""])[0])
            except (TypeError, ValueError):
                self.send_json(400, {"error": "Define episodio, inicio y final válidos."})
                return
            try:
                plan = load_plan(plan_path, root)
            except (OSError, json.JSONDecodeError, ValueError) as exc:
                self.send_json(400, {"error": str(exc)})
                return
            episodes = plan["episodes"]
            requested_path = query.get("episode_path", [None])[0]
            try:
                episode_index = preview_episode_index(episodes, episode_index, requested_path, root)
            except ValueError as exc:
                self.send_json(400, {"error": str(exc)})
                return
            episode = episodes[episode_index]
            duration = float(episode["duration_seconds"])
            if (
                not math.isfinite(start)
                or not math.isfinite(end)
                or start < 0
                or end <= start
                or end > duration + 0.05
                or end - start > MAX_PREVIEW_SECONDS
            ):
                self.send_json(400, {"error": "Intervalo de vista previa no válido o demasiado largo."})
                return
            source = Path(episode["path"]).resolve()
            if not is_within(source, root) or not source.is_file():
                self.send_json(400, {"error": "La fuente no está disponible dentro de la carpeta autorizada."})
                return
            if shutil.which("ffmpeg") is None:
                self.send_json(503, {"error": "FFmpeg no está disponible en PATH."})
                return

            preview_start = max(0.0, start - PREVIEW_CONTEXT_SECONDS)
            preview_end = min(duration, end + PREVIEW_CONTEXT_SECONDS)
            signature = f"{source}:{source.stat().st_size}:{source.stat().st_mtime_ns}:{preview_start:.3f}:{preview_end:.3f}"
            cache_key = hashlib.sha256(signature.encode("utf-8")).hexdigest()
            output = preview_dir / (cache_key + ".mp4")
            if not output.is_file():
                # Separate temporary outputs let concurrent browser requests render safely.
                staged = preview_dir / (cache_key + "." + str(threading.get_ident()) + ".tmp.mp4")
                args = [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-ss", f"{preview_start:.3f}", "-i", str(source),
                    "-t", f"{preview_end - preview_start:.3f}",
                    "-map", "0:v:0", "-map", "0:a:0?",
                    "-vf", "scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "25",
                    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
                    "-movflags", "+faststart", str(staged),
                ]
                try:
                    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240, check=False)
                    if result.returncode != 0:
                        staged.unlink(missing_ok=True)
                        error = result.stderr.decode("utf-8", "replace")[-600:]
                        self.send_json(422, {"error": "FFmpeg no pudo generar la vista previa: " + error})
                        return
                    os.replace(staged, output)
                except subprocess.TimeoutExpired:
                    staged.unlink(missing_ok=True)
                    self.send_json(504, {"error": "La vista previa tardó demasiado; acorta el intervalo."})
                    return
                except OSError as exc:
                    staged.unlink(missing_ok=True)
                    self.send_json(500, {"error": "No se pudo generar la vista previa: " + str(exc)})
                    return

            try:
                payload_size = output.stat().st_size
            except OSError as exc:
                self.send_json(500, {"error": "No se pudo leer la vista previa: " + str(exc)})
                return
            try:
                byte_range = parse_byte_range(self.headers.get("Range"), payload_size)
            except ValueError:
                self.send_response(416)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes */{payload_size}")
                self.send_header("Content-Length", "0")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return

            if byte_range is None:
                byte_start, byte_end = 0, payload_size - 1
                status_code = 200
            else:
                byte_start, byte_end = byte_range
                status_code = 206
            content_length = max(0, byte_end - byte_start + 1)
            try:
                handle = output.open("rb")
                handle.seek(byte_start)
            except OSError as exc:
                self.send_json(500, {"error": "No se pudo abrir la vista previa: " + str(exc)})
                return

            self.send_response(status_code)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(content_length))
            self.send_header("Accept-Ranges", "bytes")
            if status_code == 206:
                self.send_header("Content-Range", f"bytes {byte_start}-{byte_end}/{payload_size}")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.send_header("X-Preview-Start", f"{preview_start:.3f}")
            self.end_headers()
            try:
                with handle:
                    remaining = content_length
                    while remaining > 0:
                        chunk = handle.read(min(64 * 1024, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                # Browser seeking/stopping is normal; continue serving other requests.

        def do_POST(self):
            if urlparse(self.path).path != "/api/plan":
                self.send_json(404, {"error": "No encontrado."})
                return
            if not self.origin_allowed():
                self.send_json(403, {"error": "Origen no autorizado."})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self.send_json(400, {"error": "Longitud de solicitud inválida."})
                return
            if length <= 0 or length > MAX_PLAN_BYTES:
                self.send_json(413, {"error": "El plan está vacío o supera el límite permitido."})
                return
            try:
                data = json.loads(self.rfile.read(length).decode("utf-8"))
                validate_plan(data, root)
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
                self.send_json(400, {"error": str(exc)})
                return
            target = plan_path.with_name("edit-plan-reviewed.json")
            if target.resolve() == plan_path.resolve():
                self.send_json(409, {"error": "La ruta del plan revisado coincide con el archivo de origen."})
                return
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(
                    "w", encoding="utf-8", newline="\n",
                    dir=str(target.parent), prefix=".cutter-review-", suffix=".tmp",
                    delete=False,
                ) as handle:
                    temporary = Path(handle.name)
                    json.dump(data, handle, ensure_ascii=False, indent=2)
                    handle.write("\n")
                os.replace(temporary, target)
            except OSError as exc:
                if temporary:
                    temporary.unlink(missing_ok=True)
                self.send_json(500, {"error": "No se pudo guardar el plan revisado: " + str(exc)})
                return
            self.send_json(200, {
                "ok": True,
                "filename": target.name,
                "path": str(target),
                "approved_cuts": sum(
                    1 for episode in data["episodes"]
                    for cut in episode.get("cuts", [])
                    if cut.get("approved") is True
                ),
            })

    return ReviewHandler


def main() -> int:
    parser = argparse.ArgumentParser(description="Servidor de revisión local de Cutter Studio.")
    parser.add_argument("--folder", required=True, type=Path, help="Carpeta autorizada con episodios.")
    parser.add_argument("--plan", required=True, type=Path, help="Plan edit-plan.json que se va a revisar.")
    parser.add_argument("--port", type=int, default=0, help="Puerto local; 0 elige uno disponible.")
    args = parser.parse_args()

    root = args.folder.expanduser().resolve()
    plan_path = args.plan.expanduser().resolve()
    if not root.is_dir():
        parser.error("La carpeta autorizada no existe.")
    if not is_within(plan_path, root) or not plan_path.is_file():
        parser.error("El plan debe existir dentro de la carpeta autorizada.")
    try:
        load_plan(plan_path, root)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        parser.error(f"Plan no válido: {exc}")
    if shutil.which("ffmpeg") is None:
        parser.error("No se encuentra ffmpeg en PATH.")

    preview_dir = Path(tempfile.mkdtemp(prefix="cutter-studio-preview-"))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), build_handler(root, plan_path, preview_dir))
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"Cutter Studio revisor local: {url}")
    print("Servidor enlazado solo a 127.0.0.1. Los vídeos no se envían por Internet.")
    print("Pulsa Ctrl+C en esta ventana para detener el revisor y eliminar las vistas previas temporales.")
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print("\nDeteniendo el revisor local...")
    finally:
        server.server_close()
        shutil.rmtree(preview_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
