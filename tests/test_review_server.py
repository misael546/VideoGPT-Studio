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


class ByteRangeParserTests(unittest.TestCase):
    def test_parses_closed_open_and_suffix_ranges(self):
        self.assertEqual(review_server.parse_byte_range(None, 100), None)
        self.assertEqual(review_server.parse_byte_range("bytes=10-19", 100), (10, 19))
        self.assertEqual(review_server.parse_byte_range("bytes=20-", 100), (20, 99))
        self.assertEqual(review_server.parse_byte_range("bytes=-10", 100), (90, 99))
        self.assertEqual(review_server.parse_byte_range("bytes=0-999", 100), (0, 99))

    def test_rejects_invalid_or_multiple_ranges(self):
        for header in ["items=0-10", "bytes=-0", "bytes=100-", "bytes=10-5", "bytes=0-1,4-5", "bytes=-"]:
            with self.subTest(header=header):
                with self.assertRaises(ValueError):
                    review_server.parse_byte_range(header, 100)

    def test_rejects_ranges_for_empty_media(self):
        with self.assertRaises(ValueError):
            review_server.parse_byte_range("bytes=0-0", 0)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/FFprobe no instalados")
class ReviewServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / "Episode 01.mkv"
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

    def test_serves_episode_ordering_module(self):
        with urlopen(self.base_url + "/episode-order.js", timeout=5) as response:
            self.assertIn("javascript", response.headers.get("Content-Type", ""))
            payload = response.read().decode("utf-8")
        self.assertIn("moveEpisodeToPosition", payload)

    def test_preview_episode_is_resolved_by_source_path_after_client_reordering(self):
        episodes = [
            {"path": str(self.root / "Episode 02.mkv")},
            {"path": str(self.source)},
        ]
        selected = review_server.preview_episode_index(
            episodes,
            requested_index=0,
            requested_path=str(self.source),
            root=self.root,
        )
        self.assertEqual(selected, 1)

    def test_preview_episode_path_must_belong_to_plan_and_authorized_folder(self):
        with self.assertRaisesRegex(ValueError, "no corresponde a un episodio"):
            review_server.preview_episode_index(
                [{"path": str(self.source)}],
                requested_index=0,
                requested_path=str(self.root / "Episode 99.mkv"),
                root=self.root,
            )
        outside = self.root.parent / "outside.mp4"
        with self.assertRaisesRegex(ValueError, "fuera de la carpeta autorizada"):
            review_server.preview_episode_index(
                [{"path": str(self.source)}],
                requested_index=0,
                requested_path=str(outside),
                root=self.root,
            )

    def test_plan_api_reads_configured_plan(self):
        with urlopen(self.base_url + "/api/plan", timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            self.assertIn("default-src 'self'", response.headers.get("Content-Security-Policy", ""))
            self.assertEqual(response.headers.get("X-Frame-Options"), "DENY")
            self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")
            self.assertEqual(response.headers.get("Referrer-Policy"), "no-referrer")
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

    def test_rejects_non_finite_episode_duration(self):
        for invalid_duration in [float("nan"), float("inf"), float("-inf")]:
            plan = json.loads(json.dumps(self.plan))
            plan["episodes"][0]["duration_seconds"] = invalid_duration
            with self.subTest(duration=invalid_duration):
                with self.assertRaisesRegex(ValueError, "duración"):
                    review_server.validate_plan(plan, self.root)

    def test_rejects_non_finite_cut_times(self):
        for field, invalid_value in [
            ("start_seconds", float("nan")),
            ("end_seconds", float("inf")),
        ]:
            plan = json.loads(json.dumps(self.plan))
            plan["episodes"][0]["cuts"][0][field] = invalid_value
            with self.subTest(field=field, value=invalid_value):
                with self.assertRaisesRegex(ValueError, "intervalo"):
                    review_server.validate_plan(plan, self.root)


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
            self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")
            self.assertEqual(response.headers.get("Cross-Origin-Resource-Policy"), "same-origin")
            payload = response.read()
        self.assertEqual(content_type, "video/mp4")
        self.assertEqual(preview_start, 0.0)
        self.assertGreater(len(payload), 1000)
        self.assertTrue(list(self.preview_dir.glob("*.mp4")))

    def test_preview_endpoint_supports_byte_range_streaming(self):
        query = urlencode({"episode": 0, "start": 0.5, "end": 1.5})
        request = Request(self.base_url + "/api/preview?" + query, headers={"Range": "bytes=0-127"})
        with urlopen(request, timeout=30) as response:
            payload = response.read()
            self.assertEqual(response.status, 206)
            self.assertEqual(response.headers.get("Accept-Ranges"), "bytes")
            self.assertTrue(response.headers.get("Content-Range", "").startswith("bytes 0-127/"))
            self.assertEqual(response.headers.get("Content-Length"), "128")
        self.assertEqual(len(payload), 128)

    def test_preview_endpoint_rejects_invalid_byte_range(self):
        query = urlencode({"episode": 0, "start": 0.5, "end": 1.5})
        request = Request(self.base_url + "/api/preview?" + query, headers={"Range": "bytes=999999999-"})
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=30)
        self.assertEqual(context.exception.code, 416)
        self.assertTrue(context.exception.headers.get("Content-Range", "").startswith("bytes */"))

    def test_rejects_non_finite_preview_query_times(self):
        for start, end in [("nan", "1.5"), ("0.5", "inf"), ("-inf", "1.5")]:
            query = urlencode({"episode": 0, "start": start, "end": end})
            with self.subTest(start=start, end=end):
                with self.assertRaises(HTTPError) as context:
                    urlopen(self.base_url + "/api/preview?" + query, timeout=5)
                self.assertEqual(context.exception.code, 400)


    def test_rejects_preview_interval_beyond_episode_duration(self):
        query = urlencode({"episode": 0, "start": 2.5, "end": 4})
        with self.assertRaises(HTTPError) as context:
            urlopen(self.base_url + "/api/preview?" + query, timeout=5)
        self.assertEqual(context.exception.code, 400)
        error = json.loads(context.exception.read().decode("utf-8"))
        self.assertIn("Intervalo", error["error"])

    def test_rejects_cross_site_plan_reads(self):
        request = Request(
            self.base_url + "/api/plan",
            headers={"Origin": "http://example.invalid"},
        )
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=5)
        self.assertEqual(context.exception.code, 403)


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
