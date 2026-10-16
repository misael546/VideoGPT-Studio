import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../cutter-agent/android/", import.meta.url);

test("Android interface exposes PC connection, streamed preview and create-video controls", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8")
  ]);
  for (const id of ["pc-address", "connect-pc", "pc-status", "connection-status", "video-preview", "preview-status", "create-video", "render-status", "episode-list", "file-count", "clear-files", "watermark-text", "watermark-file", "watermark-name", "export-status", "order-summary"]) {
    assert.match(html, new RegExp('id="' + id + '"'), "missing HTML control: " + id);
  }
  for (const id of ["connect-pc", "create-video", "video-preview", "episode-list", "watermark-text", "watermark-file"]) {
    assert.ok(app.includes('$("'+id+'")'), "application does not bind control: " + id);
  }
  assert.match(html, /<video id="video-preview" controls playsinline preload="none"/);
  assert.match(html, /se guarda automáticamente/i);
  assert.match(html, /Crear video en mi PC/i);
  assert.doesNotMatch(html, /id="video-files"|type="file" accept="video\//i);
  assert.doesNotMatch(html, /import-project|export-project|JSON/i);
});

test("Android does not select, upload or locally render source videos before secure PC agent exists", async () => {
  const app = await readFile(new URL("app.js", root), "utf8");
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.doesNotMatch(app, /fetch\s*\(|XMLHttpRequest|FormData|createObjectURL/);
  assert.match(app, /createButton\.disabled = true/);
  assert.match(app, /agente remoto seguro de Windows todavía no está disponible/i);
  assert.match(html, /los vídeos originales no se guardan en el teléfono/i);
});
