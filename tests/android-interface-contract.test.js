import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../cutter-agent/android/", import.meta.url);

test("Android interface wires every required control to the application module", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8")
  ]);
  for (const id of ["video-files", "episode-list", "file-count", "clear-files", "watermark-text", "watermark-file", "watermark-name", "import-project", "export-project", "export-status", "order-summary"]) {
    assert.match(html, new RegExp('id="' + id + '"'), "missing HTML control: " + id);
    assert.ok(app.includes('$("' + id + '")'), "application does not bind control: " + id);
  }
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
  assert.match(app, /importInput=\$\("import-project"\)/);
});

test("Android interface makes no media-upload request", async () => {
  const app = await readFile(new URL("app.js", root), "utf8");
  assert.doesNotMatch(app, /fetch\s*\(/);
  assert.doesNotMatch(app, /XMLHttpRequest/);
  assert.match(app, /Este archivo contiene el orden y ajustes, no los videos/);
});
