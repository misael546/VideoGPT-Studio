import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "cutter-agent" / "cutter.py"
SPEC = importlib.util.spec_from_file_location("cutter_agent", MODULE_PATH)
cutter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cutter)


class EpisodeNumberTests(unittest.TestCase):
    def test_episode_labels(self):
        self.assertEqual(cutter.episode_number(Path("Anime_Ep_007.mkv")), 7)
        self.assertEqual(cutter.episode_number(Path("Temporada S01E12.mp4")), 12)
        self.assertEqual(cutter.episode_number(Path("Capitulo 03.webm")), 3)

    def test_no_episode_number(self):
        self.assertIsNone(cutter.episode_number(Path("opening-final.mkv")))


class RepeatedSequenceTests(unittest.TestCase):
    def test_detects_eight_or_more_similar_samples(self):
        frames = [0xAAAAAAAAAAAAAAAA for _ in range(10)]
        matches = cutter.matching_runs(frames, frames.copy(), "start")
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["duration_seconds"], 10)

    def test_ignores_short_matches(self):
        frames = [0xAAAAAAAAAAAAAAAA for _ in range(7)]
        self.assertEqual(cutter.matching_runs(frames, frames.copy(), "end"), [])

    def test_splits_matches_when_a_frame_differs(self):
        a = [0xAAAAAAAAAAAAAAAA for _ in range(12)]
        b = a.copy()
        b[5] = 0
        matches = cutter.matching_runs(a, b, "start")
        self.assertEqual([m["duration_seconds"] for m in matches], [5, 6])


if __name__ == "__main__":
    unittest.main()
