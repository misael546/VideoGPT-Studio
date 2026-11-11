import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "cutter-agent" / "edit_plan.py"
SPEC = importlib.util.spec_from_file_location("cutter_edit_plan", MODULE_PATH)
planner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(planner)


class EditPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.scan_path = self.root / "scan.json"
        self.video_a = self.root / "Episode 01.mkv"
        self.video_b = self.root / "Episode 02.mkv"
        self.scan = {
            "schema": "cutter-studio-scan/v1",
            "videos_in_proposed_order": [
                {"filename": self.video_a.name, "path": str(self.video_a), "episode_number": 1, "duration_seconds": 1200},
                {"filename": self.video_b.name, "path": str(self.video_b), "episode_number": 2, "duration_seconds": 1190},
            ],
            "repeated_sequence_candidates": [
                {
                    "episode_a": self.video_a.name,
                    "episode_b": self.video_b.name,
                    "episode_a_number": 1,
                    "episode_b_number": 2,
                    "edge": "start",
                    "episode_a_offset_seconds": 82,
                    "episode_b_offset_seconds": 80,
                    "duration_seconds": 90,
                    "alignment_shift_seconds": 2,
                }
            ],
        }
        self.scan_path.write_text(json.dumps(self.scan), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_creates_ordered_reviewable_candidates_pending_by_default(self):
        plan = planner.create_plan(self.scan_path)
        self.assertEqual(plan["schema"], "cutter-studio-edit-plan/v1")
        self.assertEqual([ep["episode_number"] for ep in plan["episodes"]], [1, 2])
        self.assertEqual(plan["summary"]["cut_candidates"], 2)
        self.assertTrue(all(cut["approved"] is False for ep in plan["episodes"] for cut in ep["cuts"]))
        self.assertTrue(all(cut["review_status"] == "pending" for ep in plan["episodes"] for cut in ep["cuts"]))
        self.assertEqual(plan["episodes"][0]["cuts"][0]["start_seconds"], 82)

    def test_manual_episode_reordering_is_preserved_in_render_manifest(self):
        plan = planner.create_plan(self.scan_path)
        # The local review UI changes the episode array order before saving.
        plan["episodes"].reverse()

        manifest = planner.build_render_manifest(plan)

        self.assertEqual(
            [episode["path"] for episode in manifest["episodes"]],
            [str(self.video_b.resolve()), str(self.video_a.resolve())],
        )
        self.assertEqual(
            [(episode["start_seconds"], episode["end_seconds"]) for episode in manifest["episodes"]],
            [(0.0, 1190.0), (0.0, 1200.0)],
        )

    def test_does_not_merge_overlapping_candidates_from_different_edges(self):
        ending = {
            "episode_a": self.video_a.name,
            "episode_b": self.video_b.name,
            "episode_a_number": 1,
            "episode_b_number": 2,
            "edge": "end",
            "episode_a_offset_seconds": 82,
            "episode_b_offset_seconds": 80,
            "episode_a_cut_start_seconds": 82,
            "episode_a_cut_end_seconds": 172,
            "episode_b_cut_start_seconds": 80,
            "episode_b_cut_end_seconds": 170,
            "duration_seconds": 90,
            "alignment_shift_seconds": 2,
            "modalities": ["audio"],
            "match_quality": {"audio": {"level": "high", "match_ratio": 1.0}},
        }
        self.scan["repeated_sequence_candidates"].append(ending)
        self.scan_path.write_text(json.dumps(self.scan), encoding="utf-8")
        plan = planner.create_plan(self.scan_path)
        for episode in plan["episodes"]:
            self.assertEqual(len(episode["cuts"]), 2)
            self.assertEqual({cut["edge"] for cut in episode["cuts"]}, {"start", "end"})


    def test_keeps_distinct_intro_and_ending_intervals_separate(self):
        ending = {
            "episode_a": self.video_a.name,
            "episode_b": self.video_b.name,
            "episode_a_number": 1,
            "episode_b_number": 2,
            "edge": "end",
            "episode_a_offset_seconds": 1100,
            "episode_b_offset_seconds": 1095,
            "duration_seconds": 80,
            "alignment_shift_seconds": -5,
            "modalities": ["audio"],
            "match_quality": {"audio": {"level": "high", "match_ratio": 0.98}},
        }
        self.scan["repeated_sequence_candidates"].append(ending)
        self.scan_path.write_text(json.dumps(self.scan), encoding="utf-8")
        plan = planner.create_plan(self.scan_path)
        self.assertEqual(plan["summary"]["cut_candidates"], 4)
        for episode in plan["episodes"]:
            self.assertEqual(len(episode["cuts"]), 2)
            self.assertLess(episode["cuts"][0]["end_seconds"], episode["cuts"][1]["start_seconds"])


    def test_deduplicates_same_cut_found_against_multiple_episode_pairs(self):
        video_c = self.root / "Episode 03.mkv"
        scan = json.loads(json.dumps(self.scan))
        scan["videos_in_proposed_order"].append({
            "filename": video_c.name,
            "path": str(video_c),
            "episode_number": 3,
            "duration_seconds": 1195,
        })

        def candidate(a, b, a_number, b_number, a_start, b_start, duration, modality, level, ratio):
            return {
                "episode_a": a,
                "episode_b": b,
                "episode_a_number": a_number,
                "episode_b_number": b_number,
                "edge": "start",
                "episode_a_offset_seconds": a_start,
                "episode_b_offset_seconds": b_start,
                "duration_seconds": duration,
                "alignment_shift_seconds": b_start - a_start,
                "modalities": [modality],
                "match_quality": {
                    modality: {"level": level, "match_ratio": ratio, "mean_hash_distance": 10}
                },
            }

        scan["repeated_sequence_candidates"] = [
            candidate(self.video_a.name, self.video_b.name, 1, 2, 82, 80, 90, "visual", "high", 0.98),
            candidate(self.video_a.name, video_c.name, 1, 3, 83, 82, 89, "audio", "medium", 0.94),
            candidate(self.video_b.name, video_c.name, 2, 3, 81, 83, 90, "visual", "medium", 0.90),
        ]
        self.scan_path.write_text(json.dumps(scan), encoding="utf-8")
        plan = planner.create_plan(self.scan_path)

        self.assertEqual(plan["summary"]["episode_count"], 3)
        self.assertEqual(plan["summary"]["cut_candidates"], 3)
        self.assertTrue(all(len(episode["cuts"]) == 1 for episode in plan["episodes"]))
        for episode in plan["episodes"]:
            cut = episode["cuts"][0]
            self.assertEqual(len(cut["source_pairs"]), 2)
            self.assertFalse(cut["approved"])
            self.assertEqual(cut["review_status"], "pending")
        first_cut = plan["episodes"][0]["cuts"][0]
        self.assertEqual(set(first_cut["modalities"]), {"audio", "visual"})
        self.assertEqual(first_cut["match_quality"]["visual"]["level"], "high")
        self.assertEqual(first_cut["match_quality"]["audio"]["level"], "medium")


    def test_surfaces_scan_and_audio_warnings_in_review_plan(self):
        self.scan["audio_warnings"] = [{
            "filename": self.video_a.name,
            "edge": "start",
            "error": "No se pudo decodificar audio",
        }]
        self.scan["visual_warnings"] = [{
            "filename": self.video_b.name,
            "edge": "end",
            "error": "No se pudo decodificar fotograma",
        }]
        self.scan["errors"] = [{
            "filename": self.video_b.name,
            "error": "Archivo dañado",
        }]
        self.scan_path.write_text(json.dumps(self.scan), encoding="utf-8")
        plan = planner.create_plan(self.scan_path)
        self.assertEqual(len(plan["scan_warnings"]), 3)
        self.assertEqual(
            {warning["type"] for warning in plan["scan_warnings"]},
            {"audio_warning", "visual_warning", "video_error"},
        )


    def test_uses_source_paths_when_episode_filenames_repeat(self):
        season_two = self.root / "Season 02"
        season_two.mkdir()
        duplicate_name = season_two / self.video_b.name
        scan = json.loads(json.dumps(self.scan))
        scan["videos_in_proposed_order"].append({
            "filename": duplicate_name.name,
            "path": str(duplicate_name),
            "season_number": 2,
            "episode_number": 2,
            "duration_seconds": 1190,
        })
        scan["repeated_sequence_candidates"] = [{
            "episode_a": self.video_a.name,
            "episode_b": duplicate_name.name,
            "episode_a_path": str(self.video_a),
            "episode_b_path": str(duplicate_name),
            "episode_a_number": 1,
            "episode_b_number": 2,
            "edge": "start",
            "episode_a_offset_seconds": 0,
            "episode_b_offset_seconds": 0,
            "duration_seconds": 90,
            "alignment_shift_seconds": 0,
            "modalities": ["visual"],
            "match_quality": {"visual": {"level": "high", "match_ratio": 1.0}},
        }]
        self.scan_path.write_text(json.dumps(scan), encoding="utf-8")

        plan = planner.create_plan(self.scan_path)
        self.assertEqual(len(plan["episodes"][1]["cuts"]), 0)
        self.assertEqual(len(plan["episodes"][2]["cuts"]), 1)
        self.assertEqual(plan["episodes"][2]["path"], str(duplicate_name.resolve()))
        self.assertEqual(plan["episodes"][2]["cuts"][0]["source_path_pair"], [
            str(self.video_a.resolve()), str(duplicate_name.resolve())
        ])

    def test_preserves_visual_and_audio_evidence_for_manual_review(self):
        self.scan["repeated_sequence_candidates"][0]["modalities"] = ["audio", "visual"]
        self.scan["repeated_sequence_candidates"][0]["match_quality"] = {
            "audio": {"level": "medium", "match_ratio": 0.95},
            "visual": {"level": "high", "match_ratio": 1.0},
        }
        self.scan_path.write_text(json.dumps(self.scan), encoding="utf-8")
        plan = planner.create_plan(self.scan_path)
        cut = plan["episodes"][0]["cuts"][0]
        self.assertEqual(cut["modalities"], ["audio", "visual"])
        self.assertEqual(cut["match_quality"]["audio"]["level"], "medium")
        self.assertEqual(cut["match_quality"]["visual"]["level"], "high")
        self.assertFalse(cut["approved"])

    def test_uses_expanded_full_opening_bounds_when_scanner_provides_them(self):
        self.scan["repeated_sequence_candidates"][0].update({
            "episode_a_offset_seconds": 3,
            "episode_b_offset_seconds": 5,
            "episode_a_cut_start_seconds": 0,
            "episode_a_cut_end_seconds": 93,
            "episode_b_cut_start_seconds": 0,
            "episode_b_cut_end_seconds": 85,
            "episode_a_boundary_expanded": True,
            "episode_b_boundary_expanded": True,
        })
        self.scan_path.write_text(json.dumps(self.scan), encoding="utf-8")
        plan = planner.create_plan(self.scan_path)
        self.assertEqual(plan["episodes"][0]["cuts"][0]["start_seconds"], 0)
        self.assertEqual(plan["episodes"][0]["cuts"][0]["end_seconds"], 93)
        self.assertTrue(plan["episodes"][0]["cuts"][0]["boundary_expanded"])

    def test_rejects_non_scan_schema(self):
        self.scan["schema"] = "other"
        self.scan_path.write_text(json.dumps(self.scan), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "informe"):
            planner.create_plan(self.scan_path)

    def test_unapproved_candidates_do_not_remove_any_video(self):
        plan = planner.create_plan(self.scan_path)
        manifest = planner.build_render_manifest(plan)
        self.assertEqual(len(manifest["episodes"]), 2)
        self.assertEqual(manifest["episodes"][0]["start_seconds"], 0)
        self.assertEqual(manifest["episodes"][0]["end_seconds"], 1200)

    def test_approved_cut_becomes_two_kept_segments(self):
        plan = planner.create_plan(self.scan_path)
        plan["episodes"][0]["cuts"][0]["approved"] = True
        manifest = planner.build_render_manifest(plan)
        self.assertEqual(manifest["episodes"][0]["start_seconds"], 0)
        self.assertEqual(manifest["episodes"][0]["end_seconds"], 82)
        self.assertEqual(manifest["episodes"][1]["start_seconds"], 172)
        self.assertEqual(manifest["episodes"][1]["end_seconds"], 1200)

    def test_overlapping_approved_cuts_are_merged(self):
        plan = planner.create_plan(self.scan_path)
        cuts = plan["episodes"][0]["cuts"]
        cuts[0]["approved"] = True
        cuts.append({
            "id": "extra", "start_seconds": 100, "end_seconds": 200,
            "approved": True, "edge": "end",
        })
        manifest = planner.build_render_manifest(plan)
        first_episode_segments = [item for item in manifest["episodes"] if item["path"] == str(self.video_a.resolve())]
        self.assertEqual(first_episode_segments, [
            {"path": str(self.video_a.resolve()), "start_seconds": 0, "end_seconds": 82},
            {"path": str(self.video_a.resolve()), "start_seconds": 200, "end_seconds": 1200},
        ])

    def test_rejects_cuts_that_remove_entire_episode(self):
        plan = planner.create_plan(self.scan_path)
        plan["episodes"][0]["cuts"] = [{"id": "all", "start_seconds": 0, "end_seconds": 1200, "approved": True}]
        with self.assertRaisesRegex(ValueError, "eliminarían todo"):
            planner.build_render_manifest(plan)

    def test_rejects_non_finite_episode_duration(self):
        for duration in [float("nan"), float("inf"), float("-inf")]:
            self.scan["videos_in_proposed_order"][0]["duration_seconds"] = duration
            self.scan_path.write_text(json.dumps(self.scan), encoding="utf-8")
            with self.subTest(duration=duration):
                with self.assertRaisesRegex(ValueError, "Duración inválida"):
                    planner.create_plan(self.scan_path)
        # Restore the fixture to avoid leaking a changed duration into other assertions.
        self.scan["videos_in_proposed_order"][0]["duration_seconds"] = 1200

    def test_rejects_non_finite_approved_cut_times(self):
        for field, value in [
            ("start_seconds", float("nan")),
            ("end_seconds", float("inf")),
        ]:
            plan = planner.create_plan(self.scan_path)
            plan["episodes"][0]["cuts"] = [{
                "id": "bad-finite",
                "start_seconds": 0,
                "end_seconds": 10,
                "approved": True,
            }]
            plan["episodes"][0]["cuts"][0][field] = value
            with self.subTest(field=field, value=value):
                with self.assertRaisesRegex(ValueError, "intervalo fuera"):
                    planner.build_render_manifest(plan)


    def test_rejects_invalid_approved_interval(self):
        plan = planner.create_plan(self.scan_path)
        plan["episodes"][0]["cuts"] = [{"id": "bad", "start_seconds": 20, "end_seconds": 1300, "approved": True}]
        with self.assertRaisesRegex(ValueError, "fuera de la duración"):
            planner.build_render_manifest(plan)


if __name__ == "__main__":
    unittest.main()
