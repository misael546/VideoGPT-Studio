import test from "node:test";
import assert from "node:assert/strict";
import { restoreEpisodeOrder } from "../cutter-agent/android/episode-order.js";

test("restores saved order using filename and file size", () => {
  const current = [
    { file: { name: "ep2.mkv", size: 200 }, id: 2 },
    { file: { name: "ep1.mkv", size: 100 }, id: 1 },
    { file: { name: "bonus.mkv", size: 300 }, id: 3 }
  ];
  const saved = [
    { order: 1, name: "ep1.mkv", size_bytes: 100 },
    { order: 2, name: "ep2.mkv", size_bytes: 200 }
  ];
  const result = restoreEpisodeOrder(current, saved);
  assert.deepEqual(result.episodes.map(item => item.id), [1, 2, 3]);
  assert.equal(result.unmatched, 0);
});

test("does not silently match duplicate names with ambiguous sizes", () => {
  const current = [
    { file: { name: "episode.mkv", size: 100 }, id: "a" },
    { file: { name: "episode.mkv", size: 200 }, id: "b" }
  ];
  const result = restoreEpisodeOrder(current, [
    { order: 1, name: "episode.mkv", size_bytes: 999 }
  ]);
  assert.deepEqual(result.episodes.map(item => item.id), ["a", "b"]);
  assert.equal(result.unmatched, 1);
});

test("supports older saved projects that have one unambiguous filename", () => {
  const current = [{ file: { name: "episode-1.mkv", size: 100 }, id: 1 }];
  const result = restoreEpisodeOrder(current, [{ order: 1, name: "episode-1.mkv" }]);
  assert.deepEqual(result.episodes.map(item => item.id), [1]);
  assert.equal(result.unmatched, 0);
});
