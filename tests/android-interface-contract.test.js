import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../cutter-agent/android/", import.meta.url);

test("Android interface wires the visible controls and autosave status", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8")
  ]);
  for (const id of ["video-files", "episode-list", "file-count", "clear-files", "watermark-text", "watermark-file", "watermark-name", "export-status", "order-summary"]) {
    assert.match(html, new RegExp('id="' + id + '"'), "missing HTML control: " + id);
    assert.ok(app.includes('$( "' + id + '" )'.replaceAll(" ", "")) || app.includes('$("'+id+'")'), "application does not bind control: " + id);
  }
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
  assert.match(app, /loadProjectState/);
  assert.match(app, /saveProjectState/);
  assert.match(html, /se guarda automáticamente/i);
  assert.doesNotMatch(html, /import-project|export-project|JSON/i);
});

test("Android interface makes no media-upload request and explains file re-selection", async () => {
  const app = await readFile(new URL("app.js", root), "utf8");
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.doesNotMatch(app, /fetch\s*\(/);
  assert.doesNotMatch(app, /XMLHttpRequest/);
  assert.match(html, /volver a seleccionar los videos originales/i);
});
