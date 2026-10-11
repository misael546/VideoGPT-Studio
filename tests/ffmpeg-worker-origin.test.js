import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const editor = read('../public/editor.js');
const advancedTools = read('../public/advanced-tools.js');
const worker = read('../public/vendor/ffmpeg/worker.js');
const constants = read('../public/vendor/ffmpeg/const.js');
const errors = read('../public/vendor/ffmpeg/errors.js');
const preparationScript = read('../scripts/prepare-ffmpeg-assets.mjs');

test('the editor and advanced tools use a same-origin worker URL', () => {
  const localWorker = /new URL\('\.\/vendor\/ffmpeg\/worker\.js', import\.meta\.url\)\.href/;
  assert.match(editor, localWorker);
  assert.match(advancedTools, localWorker);
  assert.doesNotMatch(editor, /classWorkerURL\s*=\s*['"]https?:\/\//);
  assert.doesNotMatch(advancedTools, /classWorkerURL\s*=\s*['"]https?:\/\//);
});

test('the local worker resolves its dependencies locally and uses the pinned protocol', () => {
  assert.match(worker, /from ["']\.\/const\.js["']/);
  assert.match(worker, /from ["']\.\/errors\.js["']/);
  assert.match(constants, /CORE_VERSION = ["']0\.12\.6["']/);
  assert.match(errors, /ERROR_IMPORT_FAILURE/);
});

test('the preparation script pins the worker package version and required files', () => {
  assert.match(preparationScript, /const VERSION = '0\.12\.10'/);
  assert.match(preparationScript, /const FILES = \['worker\.js', 'const\.js', 'errors\.js'\]/);
});
