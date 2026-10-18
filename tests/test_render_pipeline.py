import importlib.util
import json
import shutil
import subprocess
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

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/FFprobe no instalados")
    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/FFprobe no instalados")
    def test_failed_final_validation_preserves_previous_output(self):
        output = self.root / "final.mp4"
        original_bytes = b"previous validated output"
        output.write_bytes(original_bytes)
        self.write_manifest({
            "schema": "cutter-studio-render/v1",
            "episodes": [{"path": str(self.video), "start_seconds": 0, "end_seconds": 10}],
        })

        def fake_command(args, capture=False):
            target = Path(args[-1])
            target.write_bytes(b"x" * 2048)
            return ""

        with patch.object(
            renderer,
            "media_info",
            side_effect=[
                {"duration": 120.0, "has_audio": True, "has_video": True},
                {"duration": 10.0, "has_audio": True, "has_video": False},
            ],
        ), patch.object(renderer, "command", side_effect=fake_command):
            with self.assertRaisesRegex(RuntimeError, "no contiene una pista de vídeo"):
                renderer.render(self.manifest, output, overwrite=True)
        self.assertEqual(output.read_bytes(), original_bytes)


    def test_failed_overwrite_render_preserves_previous_output(self):
        output = self.root / "final.mp4"
        original_bytes = b"previous known-good output"
        output.write_bytes(original_bytes)
        self.write_manifest({
            "schema": "cutter-studio-render/v1",
            "episodes": [{"path": str(self.video), "start_seconds": 0, "end_seconds": 10}],
        })
        with patch.object(renderer, "media_info", return_value={"duration": 120.0, "has_audio": True}), \
             patch.object(renderer, "command", side_effect=RuntimeError("synthetic ffmpeg failure")):
            with self.assertRaisesRegex(RuntimeError, "synthetic ffmpeg failure"):
                renderer.render(self.manifest, output, overwrite=True)
        self.assertEqual(output.read_bytes(), original_bytes)


    def test_allows_output_in_separate_path(self):
        episodes = [{"path": self.video.resolve()}]
        renderer.ensure_output_not_source(episodes, self.root / "final.mp4")

    @patch.object(renderer, "media_info", return_value={"duration": 20.0, "has_audio": True})
    def test_rejects_non_finite_render_interval_values(self, _probe):
        for start, end in [(float("nan"), 5), (0, float("inf"))]:
            self.write_manifest({
                "schema": "cutter-studio-render/v1",
                "episodes": [{"path": str(self.video), "start_seconds": start, "end_seconds": end}],
            })
            with self.subTest(start=start, end=end):
                with self.assertRaisesRegex(ValueError, "tiempos finitos"):
                    renderer.load_manifest(self.manifest)


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


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/FFprobe no instalados")
class RenderIntegrationTests(unittest.TestCase):
    def test_renders_with_optional_watermark(self):
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            source = root / "episode.mkv"
            watermark = root / "watermark.png"
            manifest = root / "plan.json"
            output = root / "watermarked.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=15:d=1",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source),
            ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=white:s=96x32:d=1",
                "-frames:v", "1", str(watermark),
            ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            manifest.write_text(json.dumps({
                "schema": "cutter-studio-render/v1",
                "episodes": [{"path": str(source), "start_seconds": 0, "end_seconds": 1}],
            }), encoding="utf-8")

            result = renderer.render(manifest, output, watermark=watermark)
            self.assertTrue(result.is_file())
            self.assertGreater(result.stat().st_size, 0)
            info = renderer.media_info(result)
            self.assertAlmostEqual(info["duration"], 1.0, delta=0.25)
            self.assertTrue(info["has_audio"])


    def test_renders_and_joins_clips_with_and_without_audio(self):
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            with_audio = root / "with-audio.mp4"
            silent = root / "silent.mp4"
            manifest = root / "reviewed-plan.json"
            output = root / "joined.mp4"

            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=red:s=320x240:d=1",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", str(with_audio),
            ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=blue:s=320x240:d=1",
                "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(silent),
            ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            manifest.write_text(json.dumps({
                "schema": "cutter-studio-render/v1",
                "episodes": [
                    {"path": str(with_audio), "start_seconds": 0, "end_seconds": 0.8},
                    {"path": str(silent), "start_seconds": 0, "end_seconds": 0.8},
                ],
            }), encoding="utf-8")

            result = renderer.render(manifest, output)
            self.assertTrue(result.is_file())
            self.assertGreater(result.stat().st_size, 0)
            info = renderer.media_info(result)
            self.assertGreaterEqual(info["duration"], 1.5)
            self.assertTrue(info["has_audio"])
            probe = subprocess.run([
                "ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height", "-of", "json", str(result),
            ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            video_stream = json.loads(probe.stdout)["streams"][0]
            self.assertEqual((video_stream["width"], video_stream["height"]), (1920, 1080))


if __name__ == "__main__":
    unittest.main()
