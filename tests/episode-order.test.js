import test from "node:test";
import assert from "node:assert/strict";
import { moveEpisodeToPosition } from "../cutter-agent/episode-order.js";

test("moves an episode to the first position and renumbers every episode", () => {
  const episodes = [{ filename: "extra.mp4" }, { filename: "ep-03.mp4" }, { filename: "ep-01.mp4" }];
  const result = moveEpisodeToPosition(episodes, 2, 1);

  assert.equal(result, episodes);
  assert.deepEqual(result.map((item) => item.filename), ["ep-01.mp4", "extra.mp4", "ep-03.mp4"]);
  assert.deepEqual(result.map((item) => item.order), [1, 2, 3]);
});

test("moves an episode to the last position while preserving each episode's object and review data", () => {
  const cuts = [{ id: "C00001", approved: true }];
  const first = { filename: "ep-02.mp4", cuts, order: 1 };
  const second = { filename: "ep-01.mp4", cuts: [], order: 2 };
  const episodes = [first, second];

  moveEpisodeToPosition(episodes, 0, 2);

  assert.equal(episodes[1], first);
  assert.equal(episodes[1].cuts, cuts);
  assert.equal(episodes[1].cuts[0].approved, true);
  assert.deepEqual(episodes.map((item) => item.order), [1, 2]);
});

test("leaves the list unchanged when the selected position is already current", () => {
  const episodes = [{ filename: "one.mp4", order: 1 }, { filename: "two.mp4", order: 2 }];
  const snapshot = episodes.slice();
  assert.equal(moveEpisodeToPosition(episodes, 1, 2), episodes);
  assert.deepEqual(episodes, snapshot);
});

test("rejects invalid indexes and positions instead of corrupting the order", () => {
  const episodes = [{ filename: "one.mp4", order: 1 }, { filename: "two.mp4", order: 2 }];
  const snapshot = episodes.map((item) => ({ ...item }));

  for (const [index, position] of [[-1, 1], [2, 1], [0, 0], [0, 3], [0, 1.5]]) {
    assert.throws(() => moveEpisodeToPosition(episodes, index, position), RangeError);
  }
  assert.deepEqual(episodes, snapshot);
});

test("rejects an empty or non-array episode collection", () => {
  assert.throws(() => moveEpisodeToPosition([], 0, 1), TypeError);
  assert.throws(() => moveEpisodeToPosition(null, 0, 1), TypeError);
});
