import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'public', 'vendor', 'ffmpeg');
const VERSION = '0.12.10';
const FILES = ['worker.js', 'const.js', 'errors.js'];

await mkdir(TARGET, { recursive: true });

for (const filename of FILES) {
  const url = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@' + VERSION + '/dist/esm/' + filename;
  const response = await fetch(url, { headers: { 'user-agent': 'VideoGPT-Studio asset preparation' } });
  if (!response.ok) throw new Error('No se pudo descargar ' + filename + ' (HTTP ' + response.status + ').');

  const source = await response.text();
  if (!source.trim() || /<html[\s>]/i.test(source)) {
    throw new Error('La respuesta de ' + filename + ' no parece ser JavaScript válido.');
  }
  if (filename === 'worker.js' && (!source.includes('./const.js') || !source.includes('./errors.js'))) {
    throw new Error('El worker no contiene las dependencias esperadas para la versión ' + VERSION + '.');
  }
  await writeFile(path.join(TARGET, filename), source, 'utf8');
}

console.log('Worker FFmpeg ' + VERSION + ' preparado en public/vendor/ffmpeg.');
