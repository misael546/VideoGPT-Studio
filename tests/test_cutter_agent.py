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
        frames = [int('A' * 64, 16) for _ in range(10)]
        matches = cutter.matching_runs(frames, frames.copy(), "start")
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["duration_seconds"], 10)

    def test_ignores_short_matches(self):
        frames = [int('A' * 64, 16) for _ in range(7)]
        self.assertEqual(cutter.matching_runs(frames, frames.copy(), "end"), [])

    def test_finds_sequence_with_small_timing_offset(self):
        high = int("F" * 64, 16)
        a = [0 if i % 2 == 0 else high for i in range(20)]
        b = [high, high, *a]
        matches = cutter.matching_runs(a, b, "start")
        self.assertTrue(any(
            m["episode_a_offset_seconds"] == 0
            and m["episode_b_offset_seconds"] == 2
            and m["duration_seconds"] == 20
            for m in matches
        ))

    def test_empty_sequences_do_not_match(self):
        self.assertEqual(cutter.matching_runs([], [1] * 20, "end"), [])


if __name__ == "__main__":
    unittest.main()
