import importlib.util
import json
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

MODULE_PATH = Path(__file__).resolve().parents[1] / "cutter-agent" / "review_server.py"
SPEC = importlib.util.spec_from_file_location("cutter_review_server", MODULE_PATH)
review_server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review_server)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/FFprobe no instalados")
class ReviewServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / "Episode 01.mp4"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=15:duration=3",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-shortest", "-c:v", "libx264", "-preset", "ultrafast",
            "-pix_fmt", "yuv420p", "-c:a", "aac", str(self.source),
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.plan_path = self.root / "edit-plan.json"
        self.plan = {
            "schema": "cutter-studio-edit-plan/v1",
            "source_report": str(self.root / "scan-report.json"),
            "episodes": [{
                "order": 1,
                "path": str(self.source),
                "filename": self.source.name,
                "episode_number": 1,
                "duration_seconds": 3.0,
                "cuts": [{
                    "id": "C00001",
                    "edge": "start",
                    "start_seconds": 0.5,
                    "end_seconds": 1.5,
                    "approved": False,
                    "review_status": "pending",
                    "modalities": ["visual", "audio"],
                    "match_quality": {
                        "visual": {"level": "high"},
                        "audio": {"level": "medium"},
                    },
                }],
            }],
            "summary": {"episode_count": 1, "cut_candidates": 1},
        }
        self.plan_path.write_text(json.dumps(self.plan), encoding="utf-8")
        self.preview_dir = self.root / "preview-cache"
        self.preview_dir.mkdir()
        self.server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            review_server.build_handler(self.root, self.plan_path, self.preview_dir),
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = "http://127.0.0.1:" + str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def test_plan_api_reads_configured_plan(self):
        with urlopen(self.base_url + "/api/plan", timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
        self.assertEqual(data["schema"], "cutter-studio-edit-plan/v1")
        self.assertEqual(data["episodes"][0]["cuts"][0]["id"], "C00001")

    def test_post_saves_reviewed_plan_separately_and_resumes_it(self):
        changed = json.loads(json.dumps(self.plan))
        changed["episodes"][0]["cuts"][0]["approved"] = True
        changed["episodes"][0]["cuts"][0]["review_status"] = "approved"
        request = Request(
            self.base_url + "/api/plan",
            data=json.dumps(changed).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Origin": self.base_url,
            },
            method="POST",
        )
        with urlopen(request, timeout=5) as response:
            result = json.loads(response.read().decode("utf-8"))
        reviewed = self.root / "edit-plan-reviewed.json"
        self.assertEqual(result["filename"], reviewed.name)
        self.assertTrue(reviewed.is_file())
        self.assertTrue(json.loads(reviewed.read_text(encoding="utf-8"))["episodes"][0]["cuts"][0]["approved"])
        loaded = review_server.load_plan(self.plan_path, self.root)
        self.assertTrue(loaded["episodes"][0]["cuts"][0]["approved"])
        self.assertFalse(json.loads(self.plan_path.read_text(encoding="utf-8"))["episodes"][0]["cuts"][0]["approved"])

    def test_rejects_a_plan_that_references_outside_the_selected_folder(self):
        outside = self.root.parent / "external-episode.mp4"
        bad = json.loads(json.dumps(self.plan))
        bad["episodes"][0]["path"] = str(outside)
        with self.assertRaisesRegex(ValueError, "carpeta autorizada"):
            review_server.validate_plan(bad, self.root)

    def test_preview_endpoint_transcodes_to_browser_friendly_mp4(self):
        query = urlencode({"episode": 0, "start": 0.5, "end": 1.5})
        with urlopen(self.base_url + "/api/preview?" + query, timeout=30) as response:
            content_type = response.headers.get("Content-Type")
            preview_start = float(response.headers["X-Preview-Start"])
            payload = response.read()
        self.assertEqual(content_type, "video/mp4")
        self.assertEqual(preview_start, 0.0)
        self.assertGreater(len(payload), 1000)
        self.assertTrue(list(self.preview_dir.glob("*.mp4")))

    def test_rejects_preview_interval_beyond_episode_duration(self):
        query = urlencode({"episode": 0, "start": 2.5, "end": 4})
        with self.assertRaises(HTTPError) as context:
            urlopen(self.base_url + "/api/preview?" + query, timeout=5)
        self.assertEqual(context.exception.code, 400)
        error = json.loads(context.exception.read().decode("utf-8"))
        self.assertIn("Intervalo", error["error"])

    def test_rejects_plan_posts_from_an_untrusted_origin(self):
        request = Request(
            self.base_url + "/api/plan",
            data=json.dumps(self.plan).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Origin": "http://example.invalid",
            },
            method="POST",
        )
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=5)
        self.assertEqual(context.exception.code, 403)


if __name__ == "__main__":
    unittest.main()
