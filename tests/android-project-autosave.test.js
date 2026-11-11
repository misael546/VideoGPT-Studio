import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_STORAGE_KEY, loadProjectState, saveProjectState } from "../cutter-agent/android/project-autosave.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value))
  };
}

test("autosaves episode order and watermark text locally without video contents", () => {
  const storage = memoryStorage();
  saveProjectState(storage, {
    episodes: [
      { name: "episode-4.mkv", size_bytes: 400, last_modified: 40 },
      { name: "episode-2.mkv", size_bytes: 200, last_modified: 20 }
    ],
    watermark: { text: "Mi canal", image_name: "logo.png" }
  });
  const restored = loadProjectState(storage);
  assert.deepEqual(restored.episodes.map(item => [item.order, item.name]), [
    [1, "episode-4.mkv"], [2, "episode-2.mkv"]
  ]);
  assert.equal(restored.watermark.text, "Mi canal");
  assert.equal(restored.watermark.image_name, "logo.png");
  assert.equal(storage.getItem(PROJECT_STORAGE_KEY).includes("video_data"), false);
});

test("returns null when there is no saved project and ignores incompatible data", () => {
  const storage = memoryStorage();
  assert.equal(loadProjectState(storage), null);
  storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ schema: "other", episodes: [] }));
  assert.equal(loadProjectState(storage), null);
});
