import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "cutter-agent" / "render.py"
SPEC = importlib.util.spec_from_file_location("cutter_render", MODULE_PATH)
renderer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.video = self.root / "episode01.mp4"
        self.video.write_bytes(b"test fixture only")
        self.manifest = self.root / "plan.json"

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self, data):
        self.manifest.write_text(json.dumps(data), encoding="utf-8")

    @patch.object(renderer, "media_info", return_value={"duration": 120.0, "has_audio": True})
    def test_accepts_reviewed_cut_and_preserves_manifest_order(self, _probe):
        self.write_manifest({
            "schema": "cutter-studio-render/v1",
            "episodes": [
                {"path": str(self.video), "start_seconds": 10, "end_seconds": 80},
                {"path": str(self.video), "start_seconds": 0, "end_seconds": 20},
            ],
        })
        clips = renderer.load_manifest(self.manifest)
        self.assertEqual([clip["start"] for clip in clips], [10.0, 0.0])
        self.assertEqual([clip["duration"] for clip in clips], [70.0, 20.0])

    def test_rejects_unknown_schema(self):
        self.write_manifest({"schema": "wrong", "episodes": []})
        with self.assertRaisesRegex(ValueError, "schema"):
            renderer.load_manifest(self.manifest)

    def test_rejects_empty_episode_list(self):
        self.write_manifest({"schema": "cutter-studio-render/v1", "episodes": []})
        with self.assertRaisesRegex(ValueError, "no vacía"):
            renderer.load_manifest(self.manifest)

    @patch.object(renderer, "media_info", return_value={"duration": 20.0, "has_audio": True})
    def test_rejects_end_after_source_duration(self, _probe):
        self.write_manifest({
            "schema": "cutter-studio-render/v1",
            "episodes": [{"path": str(self.video), "start_seconds": 0, "end_seconds": 21}],
        })
        with self.assertRaisesRegex(ValueError, "supera la duración"):
            renderer.load_manifest(self.manifest)

    def test_prevents_output_from_replacing_source_video(self):
        episodes = [{"path": self.video.resolve()}]
        with self.assertRaisesRegex(ValueError, "originales"):
            renderer.ensure_output_not_source(episodes, self.video.resolve())

    def test_allows_output_in_separate_path(self):
        episodes = [{"path": self.video.resolve()}]
        renderer.ensure_output_not_source(episodes, self.root / "final.mp4")

    @patch.object(renderer, "media_info", return_value={"duration": 20.0, "has_audio": True})
    def test_rejects_negative_or_empty_intervals(self, _probe):
        for start, end in [(-1, 5), (5, 5), (8, 2)]:
            self.write_manifest({
                "schema": "cutter-studio-render/v1",
                "episodes": [{"path": str(self.video), "start_seconds": start, "end_seconds": end}],
            })
            with self.subTest(start=start, end=end):
                with self.assertRaisesRegex(ValueError, "intervalo"):
                    renderer.load_manifest(self.manifest)


if __name__ == "__main__":
    unittest.main()
