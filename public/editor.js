import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { toBlobURL } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js';

const $ = (selector) => document.querySelector(selector);
const fileInput = $('#videoFile');
const dropzone = $('#dropzone');
const sourcePreview = $('#sourcePreview');
const sourceInfo = $('#sourceInfo');
const trimStart = $('#trimStart');
const trimEnd = $('#trimEnd');
const speedInput = $('#speed');
const aspectInput = $('#aspect');
const volumeInput = $('#volume');
const volumeValue = $('#volumeValue');
const fadeInput = $('#fade');
const exportButton = $('#exportButton');
const progressArea = $('#progressArea');
const progressLabel = $('#progressLabel');
const progressPercent = $('#progressPercent');
const progressBar = $('#progressBar');
const progressDetail = $('#progressDetail');
const errorBox = $('#errorBox');
const editSummary = $('#editSummary');
const editInstructions = $('#editInstructions');
const applyInstructions = $('#applyInstructions');
const resultPanel = $('#resultPanel');
const resultPreview = $('#resultPreview');
const resultInfo = $('#resultInfo');
const downloadLink = $('#downloadLink');
const editPlanJson = $('#editPlanJson');
const applyPlanButton = $('#applyPlan');
const loadPlanExampleButton = $('#loadPlanExample');

const frameInterval = $('#frameInterval');
const captureFramesButton = $('#captureFrames');
const downloadContactSheetButton = $('#downloadContactSheet');
const frameStatus = $('#frameStatus');
const frameGallery = $('#frameGallery');


let selectedFile = null;
let sourceUrl = null;
let outputUrl = null;
let durationSeconds = 0;
let ffmpeg = null;
let ffmpegReady = false;
let busy = false;
let progressListenerAttached = false;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const mins = Math.floor(seconds / 60);
  return mins + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}
function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}
function clearError() {
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}
function applyNaturalInstructions() {
  clearError();
  const text = editInstructions.value.trim().toLowerCase();
  if (!text) {
    showError('Escribe los cambios que quieres aplicar.');
    return;
  }
  let applied = [];
  const range = text.match(/(?:de|desde)\s*(\d+(?:[.,]\d+)?)\s*(?:a|hasta|-)\s*(\d+(?:[.,]\d+)?)/);
  const firstSeconds = text.match(/(?:quita|elimina|corta|recorta)\s+(?:los\s+)?primeros?\s+(\d+(?:[.,]\d+)?)\s*(?:segundos?|s)\b/);
  const startSeconds = text.match(/(?:empieza|inicia|comienza)\s+(?:en|desde)\s*(\d+(?:[.,]\d+)?)\s*(?:segundos?|s)\b/);
  const endSeconds = text.match(/(?:termina|acaba|corta|recorta)\s+(?:en|hasta)\s*(\d+(?:[.,]\d+)?)\s*(?:segundos?|s)\b/);
  const speedMatch = text.match(/(?:velocidad|acelera(?:lo)?|acelera el video|a)\s*(?:a\s*)?(0\.5|0\.75|1(?:\.25|\.5)?|2)\s*x?\b/);
  const volumeMatch = text.match(/(?:volumen|audio)\s*(?:al|a|en)?\s*(\d{1,3})\s*%/);
  if (range) {
    trimStart.value = range[1].replace(',', '.');
    trimEnd.value = range[2].replace(',', '.');
    applied.push('recorte ' + trimStart.value + '–' + trimEnd.value + ' s');
  } else {
    if (firstSeconds || startSeconds) {
      trimStart.value = (firstSeconds || startSeconds)[1].replace(',', '.');
      applied.push('inicio ' + trimStart.value + ' s');
    }
    if (endSeconds) {
      trimEnd.value = endSeconds[1].replace(',', '.');
      applied.push('final ' + trimEnd.value + ' s');
    }
  }
  if (speedMatch) {
    speedInput.value = speedMatch[1];
    applied.push('velocidad ' + speedInput.value + '×');
  } else if (/\b(lento|despacio|cámara lenta)\b/.test(text)) {
    speedInput.value = '0.5';
    applied.push('cámara lenta 0.5×');
  }
  if (/\b(vertical|reel|tiktok|9:16)\b/.test(text)) {
    aspectInput.value = 'portrait';
    applied.push('formato vertical');
  } else if (/\b(cuadrado|1:1)\b/.test(text)) {
    aspectInput.value = 'square';
    applied.push('formato cuadrado');
  } else if (/\b(horizontal|paisaje|16:9)\b/.test(text)) {
    aspectInput.value = 'landscape';
    applied.push('formato horizontal');
  }
  if (/\b(silencia|silenciar|sin sonido|sin audio|mute)\b/.test(text)) {
    volumeInput.value = '0';
    volumeValue.textContent = '0%';
    applied.push('audio silenciado');
  } else if (volumeMatch) {
    const volume = Math.min(200, Math.max(0, Number(volumeMatch[1])));
    volumeInput.value = String(volume);
    volumeValue.textContent = volume + '%';
    applied.push('volumen ' + volume + '%');
  }
  if (/\b(fundido|fundidos|entrada suave|salida suave)\b/.test(text)) {
    fadeInput.checked = true;
    applied.push('fundidos suaves');
  }
  refreshSummary();
  if (!applied.length) {
    showError('No reconocí cambios compatibles. Prueba con “quita los primeros 5 segundos”, “acelera a 1.5x”, “vertical”, “volumen 50%” o “silencia”.');
    return;
  }
  progressArea.classList.add('hidden');
  editSummary.textContent = 'Cambios aplicados: ' + applied.join(' · ') + '. Revisa los controles antes de exportar.';
}
applyInstructions.addEventListener('click', applyNaturalInstructions);
function applyChatGPTPlan(planOverride) {
  clearError();
  let plan = planOverride;
  if (!plan) {
    try {
      plan = JSON.parse(editPlanJson.value);
    } catch {
      showError('El plan no es JSON válido. Pídele a ChatGPT que entregue únicamente un objeto JSON y pégalo completo.');
      return;
    }
  }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.version !== 1) {
    showError('Plan no compatible. Debe ser un objeto JSON con "version": 1.');
    return;
  }
  const applied = [];
  if (plan.trim !== undefined) {
    if (!plan.trim || typeof plan.trim !== 'object' || Array.isArray(plan.trim)) {
      showError('El campo "trim" debe contener "start" y, opcionalmente, "end", en segundos.');
      return;
    }
    const start = Number(plan.trim.start ?? 0);
    const end = plan.trim.end === null || plan.trim.end === undefined || plan.trim.end === '' ? durationSeconds : Number(plan.trim.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || (durationSeconds && end > durationSeconds)) {
      showError('El recorte del plan es inválido. Comprueba los segundos y que no excedan la duración del video cargado.');
      return;
    }
    trimStart.value = String(start);
    trimEnd.value = String(end);
    applied.push('recorte ' + start + '–' + end + ' s');
  }
  if (plan.speed !== undefined) {
    const speed = Number(plan.speed);
    if (![0.5, 0.75, 1, 1.25, 1.5, 2].includes(speed)) {
      showError('La velocidad debe ser una de estas opciones: 0.5, 0.75, 1, 1.25, 1.5 o 2.');
      return;
    }
    speedInput.value = String(speed);
    applied.push('velocidad ' + speed + '×');
  }
  if (plan.aspect !== undefined) {
    const allowedAspects = ['original', 'landscape', 'portrait', 'square'];
    if (!allowedAspects.includes(plan.aspect)) {
      showError('El formato debe ser original, landscape, portrait o square.');
      return;
    }
    aspectInput.value = plan.aspect;
    applied.push('formato ' + plan.aspect);
  }
  if (plan.volume !== undefined) {
    const volume = Number(plan.volume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 200) {
      showError('El volumen debe ser un número entre 0 y 200.');
      return;
    }
    volumeInput.value = String(Math.round(volume / 10) * 10);
    volumeValue.textContent = volumeInput.value + '%';
    applied.push('volumen ' + volumeInput.value + '%');
  }
  if (plan.fade !== undefined) {
    if (typeof plan.fade !== 'boolean') {
      showError('El campo "fade" debe ser true o false.');
      return;
    }
    fadeInput.checked = plan.fade;
    applied.push(plan.fade ? 'fundidos suaves' : 'sin fundidos');
  }
  if (!applied.length) {
    showError('El plan no incluye cambios compatibles. Incluye al menos uno de estos campos: trim, speed, aspect, volume o fade.');
    return;
  }
  refreshSummary();
  if (exportButton.disabled && selectedFile && durationSeconds) {
    showError('El plan se leyó, pero el recorte no es válido para este archivo. Revisa los segundos.');
    return;
  }
  editSummary.textContent = 'Plan de ChatGPT aplicado: ' + applied.join(' · ') + '. ' + (plan.title ? 'Proyecto: ' + String(plan.title).slice(0, 120) + '. ' : '') + 'Revisa los controles y pulsa “Procesar y exportar MP4”.';
  progressArea.classList.add('hidden');
}
applyPlanButton.addEventListener('click', () => applyChatGPTPlan());
loadPlanExampleButton.addEventListener('click', () => {
  const example = {
    version: 1,
    title: 'Ejemplo: reel dinámico',
    trim: { start: 2, end: durationSeconds > 8 ? Math.min(22, Math.floor(durationSeconds)) : null },
    speed: 1.25,
    aspect: 'portrait',
    volume: 80,
    fade: true
  };
  editPlanJson.value = JSON.stringify(example, null, 2);
  if (durationSeconds > 0) applyChatGPTPlan(example);
  else editSummary.textContent = 'Ejemplo cargado. Sube un video y vuelve a aplicar el plan para validar sus tiempos.';
});


function refreshSummary() {
  if (!selectedFile || !durationSeconds) {
    editSummary.textContent = 'Selecciona un video para ver su duración y preparar la edición.';
    return;
  }
  const start = Math.max(0, Number(trimStart.value) || 0);
  const end = trimEnd.value === '' ? durationSeconds : Number(trimEnd.value);
  const speed = Number(speedInput.value);
  if (start >= end || end > durationSeconds || end <= 0) {
    editSummary.textContent = 'Revisa el recorte: el final debe ser mayor que el inicio y no superar ' + durationSeconds.toFixed(1) + ' segundos.';
    exportButton.disabled = true;
    return;
  }
  const resultDuration = (end - start) / speed;
  editSummary.textContent = 'Duración final estimada: ' + resultDuration.toFixed(1) + ' s · Recorte ' + start.toFixed(1) + '–' + end.toFixed(1) + ' s · Velocidad ' + speed + '× · Audio ' + volumeInput.value + '%.';
  exportButton.disabled = busy;
}
function releaseUrl(url) {
  if (url) URL.revokeObjectURL(url);
}

let capturedFrames = [];

function waitForVideoSeek(video, targetTime) {
  if (Math.abs(video.currentTime - targetTime) < 0.015) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error('El video tardó demasiado en saltar a una escena.'));
    }, 5000);
    const onSeeked = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = targetTime;
  });
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderFrameGallery() {
  frameGallery.replaceChildren();
  capturedFrames.forEach((frame, index) => {
    const card = document.createElement('article');
    card.className = 'frame-card';
    const image = document.createElement('img');
    image.src = frame.dataUrl;
    image.alt = 'Cuadro capturado en ' + frame.time.toFixed(1) + ' segundos';
    image.loading = 'lazy';
    const time = document.createElement('p');
    time.textContent = 'Escena ' + (index + 1) + ' · ' + formatTime(frame.time);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Descargar cuadro';
    button.addEventListener('click', () => downloadDataUrl(frame.dataUrl, 'escena-' + String(index + 1).padStart(2, '0') + '.jpg'));
    card.append(image, time, button);
    frameGallery.appendChild(card);
  });
  downloadContactSheetButton.disabled = capturedFrames.length === 0;
}

async function captureVideoFrames() {
  if (!selectedFile || !durationSeconds || busy) return;
  clearError();
  captureFramesButton.disabled = true;
  downloadContactSheetButton.disabled = true;
  frameGallery.replaceChildren();
  capturedFrames = [];
  const originalTime = sourcePreview.currentTime || 0;
  const interval = Math.max(1, Number(frameInterval.value) || 5);
  const requestedCount = Math.ceil(durationSeconds / interval);
  const frameCount = Math.min(60, Math.max(1, requestedCount + 1));
  const times = Array.from({ length: frameCount }, (_, index) => frameCount === 1 ? 0 : index * Math.max(0, durationSeconds - 0.1) / (frameCount - 1));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    showError('Este navegador no permite capturar cuadros.');
    captureFramesButton.disabled = false;
    return;
  }
  sourcePreview.pause();
  try {
    for (let index = 0; index < times.length; index++) {
      const time = Math.min(times[index], Math.max(0, durationSeconds - 0.05));
      frameStatus.textContent = 'Capturando cuadro ' + (index + 1) + ' de ' + times.length + '…';
      await waitForVideoSeek(sourcePreview, time);
      const sourceWidth = sourcePreview.videoWidth || 640;
      const sourceHeight = sourcePreview.videoHeight || 360;
      const scale = Math.min(1, 480 / Math.max(sourceWidth, sourceHeight));
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      context.drawImage(sourcePreview, 0, 0, canvas.width, canvas.height);
      capturedFrames.push({ time, dataUrl: canvas.toDataURL('image/jpeg', 0.82) });
    }
    renderFrameGallery();
    frameStatus.textContent = 'Listo: ' + capturedFrames.length + ' cuadros distribuidos por todo el video. ' + (requestedCount + 1 > 60 ? 'Se limitó a 60 cuadros para cuidar la memoria del teléfono. ' : 'Intervalo aproximado: ' + interval + ' s. ') + 'Puedes descargar cuadros individuales o una hoja de escenas.';
  } catch (error) {
    showError(error?.message || 'No se pudieron capturar los cuadros de este video.');
    frameStatus.textContent = 'La captura se detuvo. Prueba con otro intervalo.';
  } finally {
    try { await waitForVideoSeek(sourcePreview, Math.min(originalTime, Math.max(0, durationSeconds - 0.05))); } catch {}
    captureFramesButton.disabled = false;
  }
}

function downloadFrameContactSheet() {
  if (!capturedFrames.length) return;
  const columns = 3;
  const cellWidth = 320;
  const cellHeight = 220;
  const rows = Math.ceil(capturedFrames.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * cellWidth;
  canvas.height = rows * cellHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    showError('No se pudo crear la hoja de escenas en este navegador.');
    return;
  }
  context.fillStyle = '#101018';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const drawAt = (index) => new Promise((resolve) => {
    const frame = capturedFrames[index];
    const img = new Image();
    img.onload = () => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = col * cellWidth;
      const y = row * cellHeight;
      const pad = 8;
      const maxW = cellWidth - pad * 2;
      const maxH = cellHeight - 34;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      context.drawImage(img, x + (cellWidth - width) / 2, y + 5 + (maxH - height) / 2, width, height);
      context.fillStyle = '#f6f4ff';
      context.font = '14px sans-serif';
      context.fillText('Escena ' + (index + 1) + ' · ' + formatTime(frame.time), x + 8, y + cellHeight - 10);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = frame.dataUrl;
  });
  Promise.all(capturedFrames.map((_, index) => drawAt(index))).then(() => {
    downloadDataUrl(canvas.toDataURL('image/jpeg', 0.88), 'hoja-de-escenas.jpg');
  });
}

captureFramesButton.addEventListener('click', captureVideoFrames);
downloadContactSheetButton.addEventListener('click', downloadFrameContactSheet);

function setFile(file) {
  clearError();
  resultPanel.classList.add('hidden');
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    selectedFile = null;
    durationSeconds = 0;
    exportButton.disabled = true;
    sourcePreview.classList.add('hidden');
    sourceInfo.classList.add('hidden');
    captureFramesButton.disabled = true;
    frameGallery.replaceChildren();
    capturedFrames = [];
    frameStatus.textContent = 'Carga un video para extraer cuadros.';
    showError('Selecciona un archivo de video válido.');
    return;
  }
  if (file.size > 120 * 1024 * 1024) {
    selectedFile = null;
    durationSeconds = 0;
    exportButton.disabled = true;
    sourcePreview.classList.add('hidden');
    sourceInfo.classList.add('hidden');
    captureFramesButton.disabled = true;
    frameGallery.replaceChildren();
    capturedFrames = [];
    frameStatus.textContent = 'Carga un video para extraer cuadros.';
    showError('Este archivo supera 120 MB. Para evitar que el navegador del teléfono se quede sin memoria, usa un video más pequeño.');
    return;
  }
  selectedFile = file;
  durationSeconds = 0;
  captureFramesButton.disabled = true;
  downloadContactSheetButton.disabled = true;
  frameGallery.replaceChildren();
  capturedFrames = [];
  frameStatus.textContent = 'Leyendo video…';
  releaseUrl(sourceUrl);
  sourceUrl = URL.createObjectURL(file);
  sourcePreview.src = sourceUrl;
  sourcePreview.classList.remove('hidden');
  sourceInfo.textContent = file.name + ' · ' + (file.size / (1024 * 1024)).toFixed(1) + ' MB · leyendo duración…';
  sourceInfo.classList.remove('hidden');
  trimStart.value = '0';
  trimEnd.value = '';
  exportButton.disabled = true;
  sourcePreview.onloadedmetadata = () => {
    durationSeconds = sourcePreview.duration;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      showError('No se pudo leer la duración. Prueba con un MP4, MOV o WebM compatible.');
      return;
    }
    trimEnd.value = durationSeconds.toFixed(1);
    captureFramesButton.disabled = false;
    frameStatus.textContent = 'Video listo. Elige cada cuántos segundos quieres capturar un cuadro.'
    sourceInfo.textContent = file.name + ' · ' + (file.size / (1024 * 1024)).toFixed(1) + ' MB · ' + formatTime(durationSeconds) + ' · ' + sourcePreview.videoWidth + '×' + sourcePreview.videoHeight;
    refreshSummary();
  };
}
fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
for (const eventName of ['dragenter', 'dragover']) {
  dropzone.addEventListener(eventName, event => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropzone.addEventListener(eventName, event => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
  });
}
dropzone.addEventListener('drop', event => {
  const file = event.dataTransfer?.files?.[0];
  if (file) setFile(file);
});
for (const control of [trimStart, trimEnd, speedInput, aspectInput, volumeInput, fadeInput]) {
  control.addEventListener('input', () => {
    if (control === volumeInput) volumeValue.textContent = volumeInput.value + '%';
    refreshSummary();
  });
}

async function loadEngine() {
  if (ffmpegReady) return;
  progressLabel.textContent = 'Descargando motor de edición gratuito…';
  progressDetail.textContent = 'Se descarga una vez desde una CDN pública. Tu video no se envía a esa CDN.';
  if (!ffmpeg) ffmpeg = new FFmpeg();
  if (!progressListenerAttached) {
    ffmpeg.on('progress', ({ progress }) => {
      const pct = Math.max(0, Math.min(99, Math.round((progress || 0) * 100)));
      progressBar.value = pct;
      progressPercent.textContent = pct + '%';
      progressLabel.textContent = 'Procesando video…';
    });
    ffmpeg.on('log', ({ message }) => {
      if (message && /error|invalid|failed/i.test(message)) progressDetail.textContent = message.slice(0, 240);
    });
    progressListenerAttached = true;
  }
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
  const coreURL = await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript');
  const wasmURL = await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm');
  await ffmpeg.load({ coreURL, wasmURL });
  ffmpegReady = true;
}
function outputDimensions() {
  if (aspectInput.value === 'landscape') return { width: 1280, height: 720 };
  if (aspectInput.value === 'portrait') return { width: 720, height: 1280 };
  if (aspectInput.value === 'square') return { width: 720, height: 720 };
  return null;
}
function safeName(name) {
  return name.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'video';
}
exportButton.addEventListener('click', async () => {
  if (!selectedFile || busy) return;
  clearError();
  const start = Math.max(0, Number(trimStart.value) || 0);
  const end = trimEnd.value === '' ? durationSeconds : Number(trimEnd.value);
  const speed = Number(speedInput.value);
  const volume = Number(volumeInput.value) / 100;
  if (!durationSeconds || start >= end || end > durationSeconds || end <= 0) {
    showError('El recorte no es válido. Comprueba los tiempos de inicio y final.');
    return;
  }
  if ((end - start) / speed > 600) {
    showError('La exportación supera 10 minutos. Recorta el video para evitar un consumo excesivo de memoria.');
    return;
  }
  busy = true;
  exportButton.disabled = true;
  exportButton.textContent = 'Procesando…';
  progressArea.classList.remove('hidden');
  resultPanel.classList.add('hidden');
  progressBar.value = 0;
  progressPercent.textContent = '0%';
  progressLabel.textContent = 'Preparando motor de edición…';
  progressDetail.textContent = 'No cierres esta pestaña durante la exportación.';
  try {
    await loadEngine();
    const inputName = 'source-input.' + ((selectedFile.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4');
    const outputName = 'videogpt-output.mp4';
    await ffmpeg.writeFile(inputName, new Uint8Array(await selectedFile.arrayBuffer()));
    const resultDuration = (end - start) / speed;
    const args = ['-hide_banner', '-y', '-ss', start.toFixed(3), '-i', inputName, '-t', resultDuration.toFixed(3)];
    const dimensions = outputDimensions();
    const filters = [];
    if (dimensions) filters.push('scale=' + dimensions.width + ':' + dimensions.height + ':force_original_aspect_ratio=decrease', 'pad=' + dimensions.width + ':' + dimensions.height + ':(ow-iw)/2:(oh-ih)/2:color=black');
    if (speed !== 1) filters.push('setpts=PTS/' + speed);
    if (fadeInput.checked) {
      filters.push('fade=t=in:st=0:d=0.5');
      if (resultDuration > 1) filters.push('fade=t=out:st=' + (resultDuration - 0.5).toFixed(3) + ':d=0.5');
    }
    if (filters.length) args.push('-vf', filters.join(','));
    if (volume !== 1 || speed !== 1) {
      const audioFilters = [];
      if (speed !== 1) audioFilters.push('atempo=' + speed);
      if (volume !== 1) audioFilters.push('volume=' + volume.toFixed(2));
      args.push('-af', audioFilters.join(','));
    }
    args.push('-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputName);
    progressLabel.textContent = 'Procesando video…';
    progressDetail.textContent = 'La duración, resolución y potencia del dispositivo afectan el tiempo de exportación.';
    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) throw new Error('FFmpeg no pudo exportar este archivo. Prueba convertirlo a MP4 H.264 y vuelve a intentarlo.');
    const data = await ffmpeg.readFile(outputName);
    if (!(data instanceof Uint8Array) || data.byteLength < 1024) throw new Error('El archivo exportado está vacío o incompleto.');
    const blob = new Blob([data], { type: 'video/mp4' });
    releaseUrl(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    resultPreview.src = outputUrl;
    downloadLink.href = outputUrl;
    downloadLink.download = safeName(selectedFile.name) + '-editado.mp4';
    resultInfo.textContent = 'MP4 validado en el navegador · ' + (blob.size / (1024 * 1024)).toFixed(1) + ' MB · ' + ((end - start) / speed).toFixed(1) + ' segundos. Se guardará en tu dispositivo al descargarlo.';
    resultPanel.classList.remove('hidden');
    progressBar.value = 100;
    progressPercent.textContent = '100%';
    progressLabel.textContent = 'Exportación completada';
    progressDetail.textContent = 'Reproduce el resultado para comprobarlo antes de descargarlo.';
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { await ffmpeg.deleteFile(inputName); await ffmpeg.deleteFile(outputName); } catch {}
  } catch (error) {
    showError((error && error.message) ? error.message : 'No se pudo procesar el video. Prueba con un archivo más pequeño o un navegador actualizado.');
    progressLabel.textContent = 'No se pudo terminar la exportación';
    progressDetail.textContent = 'El archivo original no se modificó.';
  } finally {
    busy = false;
    exportButton.textContent = 'Procesar y exportar MP4';
    refreshSummary();
  }
});
window.addEventListener('beforeunload', () => {
  releaseUrl(sourceUrl);
  releaseUrl(outputUrl);
});
