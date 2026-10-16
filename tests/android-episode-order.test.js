import test from "node:test";
import assert from "node:assert/strict";
import { guessEpisodeNumber, sortEpisodeFiles, restoreEpisodeOrder } from "../cutter-agent/android/episode-order.js";

test("detects season/episode naming patterns", () => {
  assert.equal(guessEpisodeNumber("Anime.S02E007.1080p.mkv"), 7);
  assert.equal(guessEpisodeNumber("Episode 12 - title.mp4"), 12);
  assert.equal(guessEpisodeNumber("Episodio_003.mkv"), 3);
  assert.equal(guessEpisodeNumber("capítulo 24.mp4"), 24);
});

test("uses a final numeric token when no episode label exists", () => {
  assert.equal(guessEpisodeNumber("Anime - 1080p - 016.mkv"), 16);
  assert.equal(guessEpisodeNumber("opening-final.mkv"), null);
  assert.equal(guessEpisodeNumber("Anime 1080p BluRay.mkv"), null);
});

test("sorts numbered episodes naturally and keeps unnumbered files last", () => {
  const files = [
    { name: "Anime episodio 10.mkv" },
    { name: "Anime episodio 2.mkv" },
    { name: "Especial.mkv" },
    { name: "Anime episodio 1.mkv" }
  ];
  assert.deepEqual(sortEpisodeFiles(files).map(file => file.name), [
    "Anime episodio 1.mkv",
    "Anime episodio 2.mkv",
    "Anime episodio 10.mkv",
    "Especial.mkv"
  ]);
});

test("sorts the Android episode records without losing metadata", () => {
  const episodes = [
    { key: "b", file: { name: "EP 12.mkv" }, watermarkReview: true },
    { key: "a", file: { name: "EP 2.mkv" }, watermarkReview: false }
  ];
  const sorted = sortEpisodeFiles(episodes);
  assert.deepEqual(sorted.map(item => item.key), ["a", "b"]);
  assert.equal(sorted[0].watermarkReview, false);
  assert.equal(sorted[1].watermarkReview, true);
});

test("restores saved order across multiple file-selection batches without dropping missing episodes", () => {
  const saved = [
    { order: 1, name: "Episode 03.mkv", size_bytes: 300, last_modified: 30 },
    { order: 2, name: "Episode 01.mkv", size_bytes: 100, last_modified: 10 },
    { order: 3, name: "Episode 02.mkv", size_bytes: 200, last_modified: 20 }
  ];
  const firstBatch = [
    { key: "01", file: { name: "Episode 01.mkv", size: 100, lastModified: 10 } }
  ];
  const first = restoreEpisodeOrder(firstBatch, saved);
  assert.deepEqual(first.episodes.map(item => item.file.name), ["Episode 01.mkv"]);
  assert.equal(first.unmatched, 2);

  const secondBatch = [
    ...first.episodes,
    { key: "02", file: { name: "Episode 02.mkv", size: 200, lastModified: 20 } },
    { key: "03", file: { name: "Episode 03.mkv", size: 300, lastModified: 30 } }
  ];
  const second = restoreEpisodeOrder(secondBatch, saved);
  assert.deepEqual(second.episodes.map(item => item.file.name), [
    "Episode 03.mkv", "Episode 01.mkv", "Episode 02.mkv"
  ]);
  assert.equal(second.unmatched, 0);
});

test("uses last-modified metadata to distinguish same-name same-size files when possible", () => {
  const firstFile = { key: "a", file: { name: "Episode.mkv", size: 100, lastModified: 10 } };
  const secondFile = { key: "b", file: { name: "Episode.mkv", size: 100, lastModified: 20 } };
  const restored = restoreEpisodeOrder([firstFile, secondFile], [
    { order: 1, name: "Episode.mkv", size_bytes: 100, last_modified: 20 },
    { order: 2, name: "Episode.mkv", size_bytes: 100, last_modified: 10 }
  ]);
  assert.deepEqual(restored.episodes.map(item => item.key), ["b", "a"]);
  assert.equal(restored.unmatched, 0);
});
