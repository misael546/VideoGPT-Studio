import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { toBlobURL } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js';
import { validateEditPlan } from './edit-plan.js';
import { interpretVideoInstructions } from './natural-language.js';

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

const narrationFileInput = $('#narrationFile');
const musicFileInput = $('#musicFile');
const effectsFileInput = $('#effectsFile');
const narrationVolumeInput = $('#narrationVolume');
const musicVolumeInput = $('#musicVolume');
const effectsVolumeInput = $('#effectsVolume');
const effectsOffsetInput = $('#effectsOffset');
const narrationVolumeValue = $('#narrationVolumeValue');
const musicVolumeValue = $('#musicVolumeValue');
const effectsVolumeValue = $('#effectsVolumeValue');
const audioStatus = $('#audioStatus');
const guidedGoalPanel = $('#guidedGoalPanel');
const editingWorkspace = $('#editingWorkspace');
const guidedGoalStatus = $('#guidedGoalStatus');
const goalCustomText = $('#goalCustomText');
const prepareGuidedEditButton = $('#prepareGuidedEdit');
let selectedGoal = '';



let selectedFile = null;
let sourceUrl = null;
let outputUrl = null;
let durationSeconds = 0;
let ffmpeg = null;
let ffmpegReady = false;
let busy = false;
let progressListenerAttached = false;
let ffmpegLogMessages = [];
let engineAssetUrls = [];

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
  const inputText = editInstructions.value.trim();
  if (!inputText) {
    showError('Escribe qué quieres cambiar del video.');
    return { status: 'clarify', question: '¿Qué cambio quieres hacer?' };
  }
  const result = interpretVideoInstructions(inputText, durationSeconds);
  if (result.status === 'clarify') {
    showError(result.question);
    editSummary.textContent = result.question;
    return result;
  }
  if (result.status === 'partial') {
    const partialPlan = result.plan || {};
    const applied = [];
    if (partialPlan.trim && partialPlan.trim.end !== null) {
      trimStart.value = String(partialPlan.trim.start);
      trimEnd.value = String(partialPlan.trim.end);
      applied.push('recorte ' + partialPlan.trim.start + '–' + partialPlan.trim.end + ' s');
    }
    if (partialPlan.speed !== undefined) { speedInput.value = String(partialPlan.speed); applied.push('velocidad ' + partialPlan.speed + '×'); }
    if (partialPlan.aspect !== undefined) { aspectInput.value = partialPlan.aspect; applied.push('formato ' + partialPlan.aspect); }
    if (partialPlan.volume !== undefined) { volumeInput.value = String(partialPlan.volume); volumeValue.textContent = partialPlan.volume + '%'; applied.push('volumen ' + partialPlan.volume + '%'); }
    if (partialPlan.fade !== undefined) { fadeInput.checked = partialPlan.fade; applied.push(partialPlan.fade ? 'fundidos suaves' : 'sin fundidos'); }
    if (applied.length) refreshSummary();
    showError(result.question);
    editSummary.textContent = applied.length
      ? 'Apliqué los cambios compatibles: ' + applied.join(' · ') + '. Las funciones avanzadas aún no se ejecutan.'
      : 'Entendí la intención, pero no hay cambios compatibles que aplicar automáticamente.';
    return result;
  }
  const plan = result.plan;
  const applied = [];
  if (plan.trim) {
    trimStart.value = String(plan.trim.start);
    trimEnd.value = String(plan.trim.end);
    applied.push('recorte ' + plan.trim.start + '–' + plan.trim.end + ' s');
  }
  if (plan.speed !== undefined) { speedInput.value = String(plan.speed); applied.push('velocidad ' + plan.speed + '×'); }
  if (plan.aspect !== undefined) { aspectInput.value = plan.aspect; applied.push('formato ' + plan.aspect); }
  if (plan.volume !== undefined) { volumeInput.value = String(plan.volume); volumeValue.textContent = plan.volume + '%'; applied.push('volumen ' + plan.volume + '%'); }
  if (plan.fade !== undefined) { fadeInput.checked = plan.fade; applied.push(plan.fade ? 'fundidos suaves' : 'sin fundidos'); }
  refreshSummary();
  editSummary.textContent = 'Entendí y apliqué: ' + applied.join(' · ') + '.';
  progressArea.classList.add('hidden');
  return result;
}
applyInstructions.addEventListener('click', applyNaturalInstructions);

const goalPresets = {
  improve: { title: 'Mejorar el video', speed: '1', aspect: 'original', volume: '90', fade: true },
  shorts: { title: 'TikTok / Shorts / Reels', speed: '1.25', aspect: 'portrait', volume: '80', fade: true },
  youtube: { title: 'Video para YouTube', speed: '1', aspect: 'landscape', volume: '90', fade: true },
  recap: { title: 'Resumen de anime o manhwa', speed: '1.25', aspect: 'portrait', volume: '80', fade: true },
  custom: { title: 'Edición personalizada', speed: '1', aspect: 'original', volume: '100', fade: false }
};
document.querySelectorAll('[data-goal]').forEach(button => {
  button.addEventListener('click', () => {
    selectedGoal = button.dataset.goal || '';
    document.querySelectorAll('[data-goal]').forEach(option => {
      const isSelected = option === button;
      option.classList.toggle('selected', isSelected);
      option.setAttribute('aria-pressed', String(isSelected));
    });
    prepareGuidedEditButton.disabled = !selectedGoal;
    guidedGoalStatus.textContent = 'Elegiste: ' + (goalPresets[selectedGoal]?.title || 'Edición personalizada') + '. Si quieres, agrega detalles antes de preparar el plan.';
  });
});
prepareGuidedEditButton.addEventListener('click', () => {
  clearError();
  if (!selectedFile || !durationSeconds || !goalPresets[selectedGoal]) {
    showError('Primero carga un video compatible y elige qué quieres hacer.');
    return;
  }
  const preset = goalPresets[selectedGoal];
  speedInput.value = preset.speed;
  aspectInput.value = preset.aspect;
  volumeInput.value = preset.volume;
  volumeValue.textContent = preset.volume + '%';
  fadeInput.checked = preset.fade;
  trimStart.value = '0';
  trimEnd.value = durationSeconds.toFixed(1);
  const extra = goalCustomText.value.trim();
  if (extra) {
    editInstructions.value = extra;
    const before = {
      start: trimStart.value, end: trimEnd.value, speed: speedInput.value,
      aspect: aspectInput.value, volume: volumeInput.value, fade: fadeInput.checked
    };
    applyNaturalInstructions();
    if (errorBox.classList.contains('hidden')) {
      // The compatible instruction parser refined the preset.
    } else {
      trimStart.value = before.start;
      trimEnd.value = before.end;
      speedInput.value = before.speed;
      aspectInput.value = before.aspect;
      volumeInput.value = before.volume;
      volumeValue.textContent = before.volume + '%';
      fadeInput.checked = before.fade;
      clearError();
      guidedGoalStatus.textContent = 'Apliqué el preset inicial. Parte de los detalles escritos no se reconocen como operaciones compatibles; puedes revisar las instrucciones en el editor.';
    }
  }
  const preparedPlan = {
    version: 1,
    title: preset.title,
    trim: { start: Number(trimStart.value), end: Number(trimEnd.value || durationSeconds) },
    speed: Number(speedInput.value),
    aspect: aspectInput.value,
    volume: Number(volumeInput.value),
    fade: Boolean(fadeInput.checked)
  };
  editPlanJson.value = JSON.stringify(preparedPlan, null, 2);
  refreshSummary();
  guidedGoalStatus.textContent = 'Plan preparado: ' + preset.title + '. Revisa los ajustes y pulsa “Procesar y exportar MP4” cuando estés listo.';
  editingWorkspace.classList.remove('hidden');
  editingWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

const assistantPrompt = $('#assistantPrompt');
const assistantConversation = $('#assistantConversation');
const generateFromAssistant = $('#generateFromAssistant');
let assistantPreviousPrompt = '';
let assistantNeedsClarification = false;

function addAssistantMessage(message, kind) {
  const item = document.createElement('p');
  item.className = 'assistant-message ' + (kind === 'user' ? 'assistant-user' : 'assistant-reply');
  item.textContent = message;
  assistantConversation.append(item);
  assistantConversation.scrollTop = assistantConversation.scrollHeight;
}
generateFromAssistant.addEventListener('click', async () => {
  clearError();
  if (!selectedFile || !durationSeconds) {
    const message = 'Primero elige o carga un video y espera a que aparezca su duración.';
    addAssistantMessage(message, 'assistant');
    showError(message);
    return;
  }
  const reply = assistantPrompt.value.trim();
  if (!reply) {
    const message = '¿Qué te gustaría cambiar del video? Escribe una instrucción para empezar.';
    addAssistantMessage(message, 'assistant');
    assistantPrompt.focus();
    return;
  }
  addAssistantMessage(reply, 'user');
  assistantPrompt.value = '';
  const combined = assistantNeedsClarification ? assistantPreviousPrompt + ' ' + reply : reply;
  assistantPreviousPrompt = combined;
  editInstructions.value = combined;
  const result = applyNaturalInstructions();
  if (!result || result.status === 'clarify' || result.status === 'partial') {
    assistantNeedsClarification = true;
    const message = result?.question || errorBox.textContent || '¿Puedes explicar esa parte con otras palabras?';
    addAssistantMessage(message, 'assistant');
    return;
  }
  assistantNeedsClarification = false;
  assistantPreviousPrompt = '';
  addAssistantMessage('Entendí: ' + result.understood.join(', ') + '. Voy a generar el video con esos cambios.', 'assistant');
  editingWorkspace.classList.remove('hidden');
  exportButton.click();
  if (!busy) {
    addAssistantMessage('No pude iniciar el motor de edición. Revisa el error que aparece y vuelve a intentarlo.', 'assistant');
    return;
  }
  generateFromAssistant.disabled = true;
  generateFromAssistant.textContent = 'Generando…';
  const waitForExport = () => {
    if (busy) { window.setTimeout(waitForExport, 800); return; }
    generateFromAssistant.disabled = false;
    generateFromAssistant.textContent = '✦ Generar video';
    if (!resultPanel.classList.contains('hidden')) addAssistantMessage('Tu video está listo. Reprodúcelo y descárgalo en el resultado.', 'assistant');
    else addAssistantMessage('La exportación no terminó. Revisa el mensaje de error; tu original no se modificó.', 'assistant');
  };
  window.setTimeout(waitForExport, 800);
});

function applyChatGPTPlan(planOverride) {
  clearError();
  let rawPlan = planOverride;
  if (!rawPlan) {
    try {
      rawPlan = JSON.parse(editPlanJson.value);
    } catch {
      showError('El plan no es JSON válido. Pídele a ChatGPT que entregue únicamente un objeto JSON y pégalo completo.');
      return;
    }
  }
  if (!selectedFile || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    showError('Carga primero un video y espera a que se lea su duración antes de aplicar el plan.');
    return;
  }

  // Validate the entire plan before changing any controls, so invalid plans
  // cannot leave a partially applied edit behind.
  const validation = validateEditPlan(rawPlan, durationSeconds);
  if (!validation.valid) {
    showError(validation.error);
    return;
  }
  const plan = validation.plan;
  const applied = [];

  if (plan.trim !== undefined) {
    trimStart.value = String(plan.trim.start);
    trimEnd.value = String(plan.trim.end);
    applied.push('recorte ' + plan.trim.start + '–' + plan.trim.end + ' s');
  }
  if (plan.speed !== undefined) {
    speedInput.value = String(plan.speed);
    applied.push('velocidad ' + plan.speed + '×');
  }
  if (plan.aspect !== undefined) {
    aspectInput.value = plan.aspect;
    applied.push('formato ' + plan.aspect);
  }
  if (plan.volume !== undefined) {
    volumeInput.value = String(Math.round(plan.volume / 10) * 10);
    volumeValue.textContent = volumeInput.value + '%';
    applied.push('volumen ' + volumeInput.value + '%');
  }
  if (plan.fade !== undefined) {
    fadeInput.checked = plan.fade;
    applied.push(plan.fade ? 'fundidos suaves' : 'sin fundidos');
  }

  refreshSummary();
  if (exportButton.disabled) {
    showError('El plan se validó, pero los controles resultantes no son válidos para este archivo. Revisa los segundos.');
    return;
  }
  editSummary.textContent = 'Plan aplicado: ' + applied.join(' · ') + '. ' +
    (plan.title ? 'Proyecto: ' + plan.title + '. ' : '') +
    'Revisa los controles y pulsa “Procesar y exportar MP4”.';
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
  guidedGoalPanel.classList.add('hidden');
  editingWorkspace.classList.add('hidden');
  selectedGoal = '';
  document.querySelectorAll('[data-goal]').forEach(button => button.classList.remove('selected'));
  prepareGuidedEditButton.disabled = true;
  guidedGoalStatus.textContent = 'El video todavía no se procesa. Elegiremos primero el objetivo.';
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
    guidedGoalPanel.classList.remove('hidden');
    guidedGoalStatus.textContent = 'Video listo (' + formatTime(durationSeconds) + '). Selecciona qué resultado quieres y preparo los ajustes.';
    guidedGoalPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}
fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));

async function loadSavedVideoIntoEditor() {
  const select = document.querySelector('#savedVideoSelect');
  const loadButton = document.querySelector('#loadSavedVideo');
  const libraryStatus = document.querySelector('#libraryStatus');
  if (!select || !loadButton || !libraryStatus) return;
  let savedItems = [];
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('VideoGPTStudioLibrary', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    savedItems = await new Promise((resolve, reject) => {
      const request = db.transaction('videos', 'readonly').objectStore('videos').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch (error) {
    select.replaceChildren(new Option('No se pudo leer la galería', ''));
    libraryStatus.textContent = 'No se pudo acceder al almacenamiento local del navegador.';
    return;
  }
  savedItems = savedItems.filter(item => item && item.id && item.blob && typeof item.name === 'string')
    .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
  select.replaceChildren();
  if (!savedItems.length) {
    select.add(new Option('No hay videos guardados en este navegador', ''));
    loadButton.disabled = true;
    libraryStatus.textContent = 'Si tu video aparece en otra cuenta, navegador o dispositivo, no estará disponible aquí. Abre la galería en el mismo navegador donde lo guardaste.';
    return;
  }
  select.add(new Option('Selecciona un video guardado…', ''));
  for (const item of savedItems) {
    const size = (Number(item.size || item.blob.size || 0) / (1024 * 1024)).toFixed(1);
    select.add(new Option(item.name + ' · ' + size + ' MB', item.id));
  }
  loadButton.disabled = false;
  libraryStatus.textContent = savedItems.length + ' video(s) encontrados en tu galería local.';
  const requestedId = new URLSearchParams(location.search).get('videoId');
  if (requestedId && savedItems.some(item => item.id === requestedId)) {
    select.value = requestedId;
    loadButton.click();
  }
}
document.querySelector('#loadSavedVideo')?.addEventListener('click', async () => {
  const select = document.querySelector('#savedVideoSelect');
  const status = document.querySelector('#libraryStatus');
  const id = select?.value;
  if (!id) {
    if (status) status.textContent = 'Selecciona primero un video guardado.';
    return;
  }
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('VideoGPTStudioLibrary', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const item = await new Promise((resolve, reject) => {
      const request = db.transaction('videos', 'readonly').objectStore('videos').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!item?.blob) throw new Error('No se encontró el archivo guardado.');
    const file = new File([item.blob], item.name || 'video-guardado.mp4', { type: item.type || item.blob.type || 'video/mp4', lastModified: Date.now() });
    setFile(file);
    if (status) status.textContent = 'Video cargado desde tu galería. Ya puedes elegir la edición.';
    history.replaceState(null, '', './editor.html');
  } catch (error) {
    if (status) status.textContent = 'No se pudo abrir el video guardado. Puede que el navegador haya liberado su almacenamiento.';
    showError(error?.message || 'No se pudo cargar el video de la galería.');
  }
});

loadSavedVideoIntoEditor();
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
for (const control of [narrationVolumeInput, musicVolumeInput, effectsVolumeInput]) {
  control.addEventListener('input', () => {
    const value = control.value + '%';
    if (control === narrationVolumeInput) narrationVolumeValue.textContent = value;
    if (control === musicVolumeInput) musicVolumeValue.textContent = value;
    if (control === effectsVolumeInput) effectsVolumeValue.textContent = value;
  });
}
for (const input of [narrationFileInput, musicFileInput, effectsFileInput]) {
  input.addEventListener('change', () => {
    const parts = [];
    if (narrationFileInput.files?.[0]) parts.push('voz: ' + narrationFileInput.files[0].name);
    if (musicFileInput.files?.[0]) parts.push('música: ' + musicFileInput.files[0].name);
    if (effectsFileInput.files?.[0]) parts.push('efectos: ' + effectsFileInput.files[0].name);
    audioStatus.textContent = parts.length ? 'Pistas listas para mezclar: ' + parts.join(' · ') + '. Se incluirán al exportar.' : 'Las pistas son opcionales. Si no seleccionas audio adicional, se conserva el sonido original del vídeo.';
  });
}

for (const control of [trimStart, trimEnd, speedInput, aspectInput, volumeInput, fadeInput]) {
  control.addEventListener('input', () => {
    if (control === volumeInput) volumeValue.textContent = volumeInput.value + '%';
    refreshSummary();
  });
}

async function fetchEngineAsset(path, mime, label, assetIndex) {
  const bases = [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/',
    'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/'
  ];
  let lastError;
  for (const base of bases) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    try {
      progressLabel.textContent = 'Descargando motor gratuito…';
      progressDetail.textContent = label + ' · probando una CDN pública. Tu video no se sube.';
      const response = await fetch(base + path, { signal: controller.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error('La CDN respondió HTTP ' + response.status + '.');
      const total = Number(response.headers.get('content-length')) || 0;
      const reader = response.body?.getReader();
      if (!reader) {
        const blob = await response.blob();
        const url = URL.createObjectURL(new Blob([blob], { type: mime }));
        engineAssetUrls.push(url);
        return url;
      }
      const chunks = [];
      let received = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        chunks.push(part.value);
        received += part.value.byteLength;
        if (total > 0) {
          const fraction = Math.min(1, received / total);
          const pct = Math.round((assetIndex + fraction) * 10);
          progressBar.value = pct;
          progressPercent.textContent = pct + '%';
          progressDetail.textContent = label + ': ' + Math.round(fraction * 100) + '% descargado. Tu video permanece en este dispositivo.';
        } else {
          progressDetail.textContent = label + ': ' + (received / (1024 * 1024)).toFixed(1) + ' MB descargados.';
        }
      }
      const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
      engineAssetUrls.push(url);
      return url;
    } catch (error) {
      lastError = error;
      progressDetail.textContent = 'No respondió la primera CDN; intentando una alternativa gratuita…';
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw new Error('No se pudo descargar ' + label + ' desde las CDNs gratuitas. Comprueba tu conexión, desactiva bloqueadores para esta página e inténtalo de nuevo. Detalle: ' + (lastError?.message || 'descarga interrumpida'));
}

async function loadEngine() {
  if (ffmpegReady) return;
  progressArea.classList.remove('hidden');
  progressBar.value = 0;
  progressPercent.textContent = '0%';
  progressLabel.textContent = 'Descargando motor de edición gratuito…';
  progressDetail.textContent = 'Descarga del motor de edición. Puede tardar en móviles; tu video no se envía a la CDN.';
  if (!ffmpeg) ffmpeg = new FFmpeg();
  if (!progressListenerAttached) {
    ffmpeg.on('progress', ({ progress }) => {
      const pct = Math.max(10, Math.min(99, 10 + Math.round((progress || 0) * 90)));
      progressBar.value = pct;
      progressPercent.textContent = pct + '%';
      progressLabel.textContent = 'Procesando video…';
    });
    ffmpeg.on('log', ({ message }) => {
      if (message) ffmpegLogMessages.push(message);
      if (message && /error|invalid|failed/i.test(message)) progressDetail.textContent = message.slice(0, 240);
    });
    progressListenerAttached = true;
  }
  const coreURL = await fetchEngineAsset('ffmpeg-core.js', 'text/javascript', 'Motor FFmpeg (JavaScript)', 0);
  const wasmURL = await fetchEngineAsset('ffmpeg-core.wasm', 'application/wasm', 'Motor FFmpeg (WebAssembly)', 1);
  const classWorkerURL = new URL('./vendor/ffmpeg/worker.js', window.location.href).href;
  progressLabel.textContent = 'Iniciando motor de edición…';
  progressDetail.textContent = 'Los archivos están descargados. Preparando FFmpeg en el navegador.';
  await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });
  ffmpegReady = true;
  progressBar.value = 10;
  progressPercent.textContent = '10%';
}
function outputDimensions() {
  if (aspectInput.value === 'landscape') return { width: 1280, height: 720 };
  if (aspectInput.value === 'portrait') return { width: 720, height: 1280 };
  if (aspectInput.value === 'square') return { width: 720, height: 720 };
  return null;
}
function audioExtension(name) {
  const extension = (name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'].includes(extension) ? extension : 'mp3';
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
    const narrationFile = narrationFileInput.files?.[0] || null;
    const musicFile = musicFileInput.files?.[0] || null;
    const effectsFile = effectsFileInput.files?.[0] || null;
    const extraTracks = [
      narrationFile ? { kind: 'voice', file: narrationFile, name: 'narration-track.' + audioExtension(narrationFile.name) } : null,
      musicFile ? { kind: 'music', file: musicFile, name: 'music-track.' + audioExtension(musicFile.name) } : null,
      effectsFile ? { kind: 'effects', file: effectsFile, name: 'effects-track.' + audioExtension(effectsFile.name) } : null
    ].filter(Boolean);
    for (const track of extraTracks) await ffmpeg.writeFile(track.name, new Uint8Array(await track.file.arrayBuffer()));
    let hasOriginalAudio = false;
    if (extraTracks.length) {
      ffmpegLogMessages = [];
      try { await ffmpeg.exec(['-hide_banner', '-i', inputName]); } catch {}
      hasOriginalAudio = ffmpegLogMessages.some(message => /Stream #0:.*Audio:/i.test(message));
    }
    const args = ['-hide_banner', '-y', '-ss', start.toFixed(3), '-i', inputName];
    const trackIndices = {};
    for (const track of extraTracks) {
      if (track.kind === 'music') args.push('-stream_loop', '-1');
      args.push('-i', track.name);
      trackIndices[track.kind] = trackIndices[track.kind] === undefined ? args.filter((value, index) => value === '-i').length - 1 : trackIndices[track.kind];
    }
    args.push('-t', resultDuration.toFixed(3));

    const dimensions = outputDimensions();
    const filters = [];
    if (dimensions) filters.push('scale=' + dimensions.width + ':' + dimensions.height + ':force_original_aspect_ratio=decrease', 'pad=' + dimensions.width + ':' + dimensions.height + ':(ow-iw)/2:(oh-ih)/2:color=black');
    if (speed !== 1) filters.push('setpts=PTS/' + speed);
    if (fadeInput.checked) {
      filters.push('fade=t=in:st=0:d=0.5');
      if (resultDuration > 1) filters.push('fade=t=out:st=' + (resultDuration - 0.5).toFixed(3) + ':d=0.5');
    }
    if (filters.length) args.push('-vf', filters.join(','));
    if (extraTracks.length) {
      const audioGraphs = [];
      const mixLabels = [];
      let audioInputIndex = 1;
      if (hasOriginalAudio) {
        const originalFilters = [];
        if (speed !== 1) originalFilters.push('atempo=' + speed);
        if (volume !== 1) originalFilters.push('volume=' + volume.toFixed(2));
        originalFilters.push('apad', 'atrim=duration=' + resultDuration.toFixed(3), 'asetpts=PTS-STARTPTS');
        audioGraphs.push('[0:a]' + originalFilters.join(',') + '[orig]');
        mixLabels.push('[orig]');
      }
      for (const track of extraTracks) {
        const label = track.kind === 'voice' ? 'voice' : track.kind === 'music' ? 'music' : 'sfx';
        const filtersForTrack = [];
        if (track.kind === 'voice') filtersForTrack.push('volume=' + (Number(narrationVolumeInput.value) / 100).toFixed(2));
        if (track.kind === 'music') filtersForTrack.push('volume=' + (Number(musicVolumeInput.value) / 100).toFixed(2));
        if (track.kind === 'effects') {
          const delayMs = Math.max(0, Math.min(600000, Math.round((Number(effectsOffsetInput.value) || 0) * 1000)));
          if (delayMs > 0) filtersForTrack.push('adelay=' + delayMs + '|' + delayMs);
          filtersForTrack.push('volume=' + (Number(effectsVolumeInput.value) / 100).toFixed(2));
        }
        filtersForTrack.push('apad', 'atrim=duration=' + resultDuration.toFixed(3), 'asetpts=PTS-STARTPTS');
        audioGraphs.push('[' + audioInputIndex + ':a]' + filtersForTrack.join(',') + '[' + label + ']');
        mixLabels.push('[' + label + ']');
        audioInputIndex++;
      }
      audioGraphs.push(mixLabels.join('') + 'amix=inputs=' + mixLabels.length + ':duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]');
      args.push('-filter_complex', audioGraphs.join(';'), '-map', '0:v:0', '-map', '[aout]');
    } else {
      if (volume !== 1 || speed !== 1) {
        const audioFilters = [];
        if (speed !== 1) audioFilters.push('atempo=' + speed);
        if (volume !== 1) audioFilters.push('volume=' + volume.toFixed(2));
        args.push('-af', audioFilters.join(','));
      }
      args.push('-map', '0:v:0', '-map', '0:a?');
    }
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outputName);
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
    try { await ffmpeg.deleteFile(inputName); await ffmpeg.deleteFile(outputName); for (const track of extraTracks) await ffmpeg.deleteFile(track.name); } catch {}
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
  for (const url of engineAssetUrls) URL.revokeObjectURL(url);
});
