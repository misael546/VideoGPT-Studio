import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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


class AbsoluteOffsetTests(unittest.TestCase):
    def test_start_offset_is_already_absolute(self):
        self.assertEqual(cutter.absolute_offset(12, 1200, "start"), 12)

    def test_end_offset_accounts_for_tail_window(self):
        self.assertEqual(cutter.absolute_offset(12, 1200, "end"), 1032)

    def test_short_episode_end_offset_stays_inside_episode(self):
        self.assertEqual(cutter.absolute_offset(4, 20, "end"), 4)


class ScanCacheTests(unittest.TestCase):
    def test_second_scan_reuses_metadata_and_frame_hashes(self):
        with tempfile.TemporaryDirectory() as temp_name:
            root = Path(temp_name)
            folder = root / "episodes"
            folder.mkdir()
            video = folder / "Episode 01.mp4"
            video.write_bytes(b"synthetic test input")
            report_one = root / "scan-one.json"
            report_two = root / "scan-two.json"
            metadata = {"duration_seconds": 20.0, "width": 640, "height": 360, "size_bytes": video.stat().st_size}
            with mock.patch.object(cutter, "probe", return_value=metadata) as probe_mock, \
                 mock.patch.object(cutter, "frame_hashes", return_value=[int("A" * 64, 16)] * 20) as frame_mock:
                first = cutter.scan(folder, report_one)
                self.assertEqual(probe_mock.call_count, 1)
                self.assertEqual(frame_mock.call_count, 2)
            with mock.patch.object(cutter, "probe", side_effect=AssertionError("cache miss")), \
                 mock.patch.object(cutter, "frame_hashes", side_effect=AssertionError("cache miss")):
                second = cutter.scan(folder, report_two)
            self.assertEqual(first["cache"]["hits"], 0)
            self.assertEqual(second["cache"]["hits"], 1)
            self.assertEqual(second["cache"]["misses"], 0)
            self.assertEqual(second["videos_in_proposed_order"][0]["duration_seconds"], 20.0)


class PerceptualHashTests(unittest.TestCase):
    def test_combined_hash_encodes_average_pattern_and_gradients(self):
        pixels = bytes(50 + ((index * 13) % 80) for index in range(256))
        fingerprint = cutter.perceptual_hash(pixels)
        self.assertGreater(fingerprint.bit_length(), cutter.AHASH_BITS)
        self.assertNotEqual(fingerprint & ((1 << cutter.DHASH_BITS) - 1), 0)

    def test_uniform_brightness_shift_preserves_fingerprint(self):
        pixels = bytes(40 + ((index * 13) % 80) for index in range(256))
        brighter = bytes(value + 45 for value in pixels)
        self.assertEqual(cutter.perceptual_hash(pixels), cutter.perceptual_hash(brighter))

    def test_rejects_wrong_pixel_count(self):
        with self.assertRaisesRegex(ValueError, "píxeles"):
            cutter.perceptual_hash(b"short")


class MatchQualityTests(unittest.TestCase):
    def test_high_quality_means_long_consistent_visual_match(self):
        self.assertEqual(cutter.quality_level(45, 0.98, 20), "high")

    def test_short_or_noisy_match_is_not_labeled_high(self):
        self.assertEqual(cutter.quality_level(10, 0.75, 70), "low")
        self.assertEqual(cutter.quality_level(20, 0.85, 50), "medium")


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

    def test_tolerates_two_isolated_visual_mismatches_and_reports_quality(self):
        frame = int("A" * 64, 16)
        other = int("5" * 64, 16)
        left = [frame] * 20
        right = [frame] * 20
        right[5] = other
        right[13] = other
        matches = cutter.matching_runs(left, right, "start")
        self.assertTrue(matches)
        best = max(matches, key=lambda item: item["duration_seconds"])
        self.assertEqual(best["duration_seconds"], 20)
        self.assertLess(best["match_ratio"], 1.0)
        self.assertEqual(best["matched_samples"], 18)

    def test_empty_sequences_do_not_match(self):
        self.assertEqual(cutter.matching_runs([], [1] * 20, "end"), [])


if __name__ == "__main__":
    unittest.main()
