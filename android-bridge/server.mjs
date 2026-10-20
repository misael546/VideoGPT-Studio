#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOST = process.env.VIDEOGPT_BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.VIDEOGPT_BRIDGE_PORT || 43821);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const HOME = os.homedir();
const ROOTS = [
  path.resolve(HOME, 'storage/shared'),
  path.resolve(HOME, 'VideoGPTStudio')
];
const TOKEN = process.env.VIDEOGPT_BRIDGE_TOKEN || randomBytes(24).toString('hex');
const MAX_BODY = 64 * 1024;
const SPEEDS = new Set([0.5, 0.75, 1, 1.25, 1.5, 2]);
const ASPECTS = new Set(['original', 'landscape', 'portrait', 'square']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': 'http://127.0.0.1:' + PORT,
    'vary': 'Origin'
  });
  res.end(JSON.stringify(body));
}

function withinRoots(target) {
  const resolved = path.resolve(target);
  return ROOTS.some(root => resolved === root || resolved.startsWith(root + path.sep));
}

function authorized(req) {
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(TOKEN);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY) throw Object.assign(new Error('Solicitud demasiado grande.'), { status: 413 });
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw Object.assign(new Error('JSON no válido.'), { status: 400 }); }
}

function validateNumber(value, fallback, min, max, name) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw Object.assign(new Error(name + ' fuera de rango.'), { status: 400 });
  }
  return number;
}

async function resolveVideoInput(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || !withinRoots(value)) {
    throw Object.assign(new Error('La ruta del original debe estar dentro de ~/storage/shared o ~/VideoGPTStudio.'), { status: 400 });
  }
  const real = await fs.realpath(value);
  if (!withinRoots(real)) throw Object.assign(new Error('La ruta real del original está fuera de las carpetas permitidas.'), { status: 403 });
  const stat = await fs.stat(real);
  if (!stat.isFile() || !VIDEO_EXTS.has(path.extname(real).toLowerCase())) {
    throw Object.assign(new Error('El original debe ser un archivo de video compatible.'), { status: 400 });
  }
  return real;
}

async function resolveOutput(value, input) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || !withinRoots(value) || path.extname(value).toLowerCase() !== '.mp4') {
    throw Object.assign(new Error('La salida debe ser un archivo .mp4 dentro de ~/storage/shared o ~/VideoGPTStudio.'), { status: 400 });
  }
  const parent = await fs.realpath(path.dirname(path.resolve(value)));
  if (!withinRoots(parent)) throw Object.assign(new Error('La carpeta de salida está fuera de las carpetas permitidas.'), { status: 403 });
  const output = path.join(parent, path.basename(value));
  if (output === input) throw Object.assign(new Error('La salida nunca puede sobrescribir el original.'), { status: 400 });
  try {
    await fs.access(output);
    throw Object.assign(new Error('Ya existe un archivo con ese nombre; elige otro para conservar el resultado anterior.'), { status: 409 });
  } catch (error) {
    if (error.status) throw error;
    if (error.code !== 'ENOENT') throw error;
  }
  return output;
}

function buildArgs(input, output, opts) {
  const args = [];
  if (opts.trimStart > 0) args.push('-ss', String(opts.trimStart));
  args.push('-i', input);
  if (opts.trimEnd > 0) args.push('-t', String(opts.trimEnd - opts.trimStart));

  const videoFilters = [];
  if (opts.speed !== 1) videoFilters.push('setpts=PTS/' + opts.speed);
  if (opts.aspect === 'landscape') videoFilters.push('scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720');
  if (opts.aspect === 'portrait') videoFilters.push('scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280');
  if (opts.aspect === 'square') videoFilters.push('scale=720:720:force_original_aspect_ratio=increase,crop=720:720');
  videoFilters.push('setsar=1');
  args.push('-vf', videoFilters.join(','));

  const audioFilters = ['volume=' + opts.volume];
  if (opts.speed !== 1) audioFilters.push('atempo=' + opts.speed);
  if (opts.fade) {
    audioFilters.push('afade=t=in:d=0.5');
    const sourceDuration = opts.trimEnd > 0 ? opts.trimEnd - opts.trimStart : 0;
    if (sourceDuration > 1) audioFilters.push('afade=t=out:st=' + Math.max(0.5, sourceDuration / opts.speed - 0.5) + ':d=0.5');
  }
  args.push('-af', audioFilters.join(','));
  args.push(
    '-map', '0:v:0', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-n', output
  );
  return args;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { if (stderr.length < 6000) stderr += chunk.toString(); });
    child.on('error', error => reject(new Error('No se pudo iniciar FFmpeg. Instálalo en Termux con: pkg install ffmpeg. ' + error.message)));
    child.on('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg terminó con código ' + code + (stderr ? ': ' + stderr.trim() : '.'))));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://' + HOST + ':' + PORT);
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, service: 'VideoGPT Studio Android Local Bridge', localOnly: HOST === '127.0.0.1' || HOST === '::1', ffmpeg: FFMPEG, version: 1 });
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '600' });
    return res.end();
  }
  if (url.pathname !== '/api/edit' || req.method !== 'POST') return json(res, 404, { error: 'Ruta no encontrada.' });
  if (!authorized(req)) return json(res, 401, { error: 'Token local incorrecto.' });

  let output = null;
  try {
    const body = await readJson(req);
    const input = await resolveVideoInput(body.input);
    const trimStart = validateNumber(body.trimStart, 0, 0, 86400, 'trimStart');
    const trimEnd = validateNumber(body.trimEnd, 0, 0, 86400, 'trimEnd');
    if (trimEnd > 0 && trimEnd <= trimStart) throw Object.assign(new Error('trimEnd debe ser mayor que trimStart.'), { status: 400 });
    const speed = validateNumber(body.speed, 1, 0.5, 2, 'speed');
    if (!SPEEDS.has(speed)) throw Object.assign(new Error('Velocidad no permitida.'), { status: 400 });
    const aspect = body.aspect === undefined ? 'original' : body.aspect;
    if (!ASPECTS.has(aspect)) throw Object.assign(new Error('Formato no permitido.'), { status: 400 });
    const volume = validateNumber(body.volume, 1, 0, 2, 'volume');
    const fade = body.fade === true;
    output = await resolveOutput(body.output, input);
    const args = buildArgs(input, output, { trimStart, trimEnd, speed, aspect, volume, fade });
    await runFfmpeg(args);
    const stat = await fs.stat(output);
    if (!stat.isFile() || stat.size < 1024) {
      await fs.rm(output, { force: true });
      throw new Error('El archivo exportado no pasó la validación básica; se eliminó el resultado incompleto.');
    }
    return json(res, 200, {
      ok: true,
      output,
      bytes: stat.size,
      message: 'Exportación local completada. Reproduce el MP4 y revísalo antes de usarlo.'
    });
  } catch (error) {
    if (output) {
      try { await fs.rm(output, { force: true }); } catch {}
    }
    return json(res, error.status || 500, { error: error.message || 'Error local de procesamiento.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log('[VideoGPT Studio] Puente local listo en http://' + HOST + ':' + PORT);
  console.log('[VideoGPT Studio] Token de sesión (guárdalo; no lo compartas): ' + TOKEN);
  console.log('[VideoGPT Studio] Carpetas permitidas: ' + ROOTS.join(' | '));
  console.log('[VideoGPT Studio] Solo escucha en localhost. No está conectado a ChatGPT.');
});
