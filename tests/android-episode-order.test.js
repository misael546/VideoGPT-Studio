import test from "node:test";
import assert from "node:assert/strict";
import { guessEpisodeNumber, sortEpisodeFiles } from "../cutter-agent/android/episode-order.js";

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
