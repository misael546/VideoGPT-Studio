import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';

const $ = (selector) => document.querySelector(selector);
const videoInput = $('#videoFile');
const sourceVideo = $('#sourcePreview');
const sceneButton = $('#analyzeScenes');
const transcriptButton = $('#transcribeVideo');
const narrationButton = $('#generateNarration');
const sceneStatus = $('#sceneAnalysisStatus');
const transcriptStatus = $('#transcriptStatus');
const voiceStatus = $('#voiceStatus');
const sceneList = $('#detectedScenes');
const transcriptText = $('#transcriptText');
const narrationText = $('#narrationText');
const narrationVoice = $('#narrationVoice');
const useTranscriptButton = $('#useTranscript');
let sceneBusy = false;
let speechBusy = false;
let ttsBusy = false;
let ffmpeg = null;
let ffmpegPromise = null;
let transcriberPromise = null;
let ttsPromise = null;
let detectedScenes = [];
let activeFile = null;
let lastSceneAnalysisSucceeded = false;

function setStatus(element, message) { if (element) element.textContent = message; }
function setBusy(button, busy, label) {
  button.disabled = busy || !activeFile;
  if (busy) { button.dataset.originalLabel ||= button.textContent; button.textContent = label; }
  else if (button.dataset.originalLabel) { button.textContent = button.dataset.originalLabel; delete button.dataset.originalLabel; }
}
function formatTime(value) {
  const s = Math.max(0, Math.floor(value));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function waitSeek(video, time) {
  if (Math.abs(video.currentTime - time) < 0.02 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { video.removeEventListener('seeked', done); reject(new Error('El video tardó demasiado al analizar un cuadro.')); }, 8000);
    const done = () => { clearTimeout(timer); resolve(); };
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = time;
  });
}
function captureThumbnail(video, time) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 360 / Math.max(video.videoWidth || 640, video.videoHeight || 360));
  canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
  canvas.height = Math.max(1, Math.round((video.videoHeight || 360) * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.78);
}
function frameSignature(video, size = 24) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = Math.round(size * 9 / 16);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let p = 0, i = 0; p < data.length; p += 4, i++) gray[i] = Math.round(data[p] * .299 + data[p + 1] * .587 + data[p + 2] * .114);
  return gray;
}
function frameDifference(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
function renderScenes() {
  sceneList.replaceChildren();
  detectedScenes.forEach((scene, index) => {
    const card = document.createElement('article');
    card.className = 'detected-scene';
    const img = document.createElement('img');
    img.src = scene.image;
    img.alt = 'Cuadro de posible cambio de escena en ' + formatTime(scene.time);
    const title = document.createElement('strong');
    title.textContent = 'Escena ' + (index + 1);
    const time = document.createElement('span');
    time.textContent = formatTime(scene.time) + ' · cambio visual';
    const actions = document.createElement('div');
    const start = document.createElement('button');
    start.type = 'button'; start.textContent = 'Usar inicio';
    start.addEventListener('click', () => {
      const field = $('#trimStart'); if (field) { field.value = scene.time.toFixed(1); field.dispatchEvent(new Event('input', { bubbles: true })); }
      sourceVideo.currentTime = scene.time;
    });
    const end = document.createElement('button');
    end.type = 'button'; end.textContent = 'Usar final';
    end.addEventListener('click', () => {
      const field = $('#trimEnd'); if (field) { field.value = scene.time.toFixed(1); field.dispatchEvent(new Event('input', { bubbles: true })); }
      sourceVideo.currentTime = scene.time;
    });
    actions.append(start, end);
    card.append(img, title, time, actions);
    sceneList.append(card);
  });
}
async function analyzeScenes() {
  if (!activeFile || sceneBusy) return;
  sceneBusy = true; setBusy(sceneButton, true, 'Analizando cuadros…');
  detectedScenes = []; lastSceneAnalysisSucceeded = false; sceneList.replaceChildren();
  const duration = Number(sourceVideo.duration);
  const originalTime = sourceVideo.currentTime || 0;
  const sampleStep = Math.max(.5, Math.min(1.5, duration / 180));
  let previous = null;
  let lastScene = -10;
  try {
    sourceVideo.pause();
    const maxSamples = Math.min(240, Math.ceil(duration / sampleStep));
    for (let i = 0; i < maxSamples; i++) {
      const time = Math.min(duration - .08, i * sampleStep);
      await waitSeek(sourceVideo, Math.max(0, time));
      const signature = frameSignature(sourceVideo);
      const diff = frameDifference(previous, signature);
      if (i === 0 || (diff >= 31 && time - lastScene >= 1.4)) {
        detectedScenes.push({ time: Math.max(0, time), image: captureThumbnail(sourceVideo, Math.max(0, time)), difference: Math.round(diff) });
        lastScene = time;
      }
      previous = signature;
      setStatus(sceneStatus, 'Comparando cuadros ' + (i + 1) + ' de ' + maxSamples + ' (' + Math.round((i + 1) / maxSamples * 100) + '%)…');
    }
    renderScenes();
    lastSceneAnalysisSucceeded = true;
    setStatus(sceneStatus, 'Análisis listo: ' + detectedScenes.length + ' puntos de posible cambio visual. Detecta diferencias entre cuadros; no identifica por sí solo personajes ni el significado de la escena.');
  } catch (error) {
    setStatus(sceneStatus, error.message || 'No se pudo analizar este video.');
  } finally {
    try { await waitSeek(sourceVideo, Math.min(originalTime, Math.max(0, duration - .08))); } catch {}
    sceneBusy = false; setBusy(sceneButton, false);
  }
}
sceneButton?.addEventListener('click', analyzeScenes);

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const engine = new FFmpeg();
    const bases = [
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/',
      'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/'
    ];
    let lastError;
    for (const base of bases) {
      try {
        const [coreResponse, wasmResponse] = await Promise.all([
          fetch(base + 'ffmpeg-core.js', { cache: 'force-cache' }),
          fetch(base + 'ffmpeg-core.wasm', { cache: 'force-cache' })
        ]);
        if (!coreResponse.ok || !wasmResponse.ok) throw new Error('No se pudieron descargar los componentes FFmpeg.');
        const [core, wasm] = await Promise.all([coreResponse.blob(), wasmResponse.blob()]);
        const coreURL = URL.createObjectURL(new Blob([core], { type: 'text/javascript' }));
        const wasmURL = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }));
        const { toBlobURL } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js');
        const classWorkerURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js';
        await engine.load({ coreURL, wasmURL, classWorkerURL });
        ffmpeg = engine;
        return engine;
      } catch (error) { lastError = error; }
    }
    throw new Error('No se pudo iniciar FFmpeg para extraer el audio. ' + (lastError?.message || ''));
  })();
  try { return await ffmpegPromise; } finally { ffmpegPromise = null; }
}
async function getTranscriber() {
  if (!transcriberPromise) transcriberPromise = (async () => {
    setStatus(transcriptStatus, 'Descargando el modelo Whisper Tiny (puede ser una descarga grande la primera vez)…');
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      progress_callback: (progress) => {
        if (progress?.status === 'progress') setStatus(transcriptStatus, 'Descargando modelo de transcripción: ' + Math.round(progress.progress || 0) + '%…');
      }
    });
  })();
  return transcriberPromise;
}
function wavToFloat32(buffer) {
  const view = new DataView(buffer);
  let offset = 12, dataOffset = -1, dataLength = 0, format = 1, channels = 1, bits = 16, sampleRate = 16000;
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
    const length = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      format = view.getUint16(offset + 8, true); channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true); bits = view.getUint16(offset + 22, true);
    } else if (id === 'data') { dataOffset = offset + 8; dataLength = length; break; }
    offset += 8 + length + (length % 2);
  }
  if (dataOffset < 0 || format !== 1 || bits !== 16) throw new Error('El audio extraído no tiene formato WAV PCM compatible.');
  const samples = new Float32Array(Math.floor(dataLength / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
  if (channels > 1) {
    const mono = new Float32Array(Math.floor(samples.length / channels));
    for (let i = 0; i < mono.length; i++) {
      let sum = 0; for (let ch = 0; ch < channels; ch++) sum += samples[i * channels + ch];
      mono[i] = sum / channels;
    }
    return { audio: mono, sampleRate };
  }
  return { audio: samples, sampleRate };
}
async function transcribeVideo() {
  if (!activeFile || speechBusy) return;
  speechBusy = true; setBusy(transcriptButton, true, 'Preparando transcripción…');
  try {
    setStatus(transcriptStatus, 'Preparando el audio local del video…');
    const engine = await getFFmpeg();
    const ext = (activeFile.name.split('.').pop() || 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const inputName = 'transcribe-source.' + (ext || 'mp4');
    await engine.writeFile(inputName, new Uint8Array(await activeFile.arrayBuffer()));
    const code = await engine.exec(['-hide_banner', '-y', '-i', inputName, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-t', '600', 'speech-audio.wav']);
    if (code !== 0) throw new Error('No se pudo extraer el audio. Comprueba que el video tenga una pista de sonido.');
    const wav = await engine.readFile('speech-audio.wav');
    if (!(wav instanceof Uint8Array) || wav.byteLength < 1000) throw new Error('El video no contiene suficiente audio para transcribir.');
    setStatus(transcriptStatus, 'Cargando Whisper Tiny y reconociendo el habla… La primera ejecución puede tardar en el teléfono.');
    const model = await getTranscriber();
    const decoded = wavToFloat32(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
    const result = await model(decoded.audio, {
      sampling_rate: decoded.sampleRate,
      language: 'spanish',
      task: 'transcribe',
      chunk_length_s: 20,
      stride_length_s: 4
    });
    const text = String(result?.text || '').trim();
    if (!text) throw new Error('El modelo no reconoció palabras claras. Puede que el video no tenga diálogo audible o que el ruido sea demasiado alto.');
    transcriptText.value = text;
    narrationText.value = text;
    useTranscriptButton.disabled = false;
    setStatus(transcriptStatus, 'Transcripción lista. Revísala: el reconocimiento puede equivocarse, especialmente con música, ruido, nombres propios o letras cantadas.');
    setStatus(voiceStatus, 'Copié la transcripción al guion de narración; puedes editarla antes de generar la voz.');
    try { await engine.deleteFile(inputName); await engine.deleteFile('speech-audio.wav'); } catch {}
  } catch (error) {
    setStatus(transcriptStatus, 'No se completó la transcripción: ' + (error?.message || 'error desconocido') + ' Si el teléfono se queda sin memoria, prueba con un clip más corto.');
  } finally {
    speechBusy = false; setBusy(transcriptButton, false);
  }
}
transcriptButton?.addEventListener('click', transcribeVideo);
useTranscriptButton?.addEventListener('click', () => {
  if (transcriptText.value.trim()) narrationText.value = transcriptText.value.trim();
});

function floatToWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
async function getTTS() {
  if (!ttsPromise) ttsPromise = (async () => {
    setStatus(voiceStatus, 'Descargando el modelo de voz Kokoro (primera vez puede tardar)…');
    const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
    return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm' });
  })();
  return ttsPromise;
}
function makeNarrationScript(instruction) {
  const raw = String(instruction || '').trim();
  const explicit = raw.match(/(?:di(?:ga)?|diciendo|lee|leer|narra(?:cion)?(?:\s+que\s+diga)?|voz\s+que\s+diga)\s*[:,-]?\s*[“"']([^”"']{8,800})[”"']/i);
  if (explicit) return explicit[1].trim();
  const lower = raw.toLocaleLowerCase('es');
  if (/\b(viaje|viajes|vacaciones|paisaje|playa|montana|ciudad)\b/.test(lower)) return 'Acompáñanos en este recorrido. Cada lugar guarda un momento especial y cada escena nos invita a descubrir algo nuevo. Disfruta el viaje y sus mejores momentos.';
  if (/\b(juego|gaming|partida|jugando|videojuego)\b/.test(lower)) return 'La acción comienza ahora. Cada movimiento cuenta y los mejores momentos están por venir. Quédate hasta el final para ver cómo se desarrolla la partida.';
  if (/\b(producto|negocio|marca|anuncio|promocion|venta)\b/.test(lower)) return 'Descubre los detalles, conoce lo que lo hace especial y disfruta esta presentación. Una propuesta pensada para destacar desde el primer momento.';
  return 'Estos son los momentos más destacados de este video. Cada escena aporta un detalle distinto. Disfruta el recorrido y quédate hasta el final.';
}
function assignGeneratedAudio(input, name, blob) {
  if (!input) throw new Error('No se encontró la pista de audio ' + name + '.');
  const file = new File([blob], name, { type: 'audio/wav', lastModified: Date.now() });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return file;
}
function makeBackgroundMusic(durationSeconds) {
  const sampleRate = 22050;
  const duration = Math.max(8, Math.min(180, Number(durationSeconds) || 30));
  const count = Math.floor(sampleRate * duration);
  const samples = new Float32Array(count);
  const chords = [
    [130.81, 164.81, 196.00], [110.00, 130.81, 164.81],
    [87.31, 110.00, 130.81], [98.00, 123.47, 146.83]
  ];
  const melody = [261.63, 293.66, 329.63, 392.00, 329.63, 293.66, 220.00, 261.63];
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const chord = chords[Math.floor(t / 4) % chords.length];
    const pulse = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.18 * t);
    let value = 0;
    for (let k = 0; k < chord.length; k++) {
      value += Math.sin(2 * Math.PI * chord[k] * t + k * 0.25) * (k === 0 ? 0.10 : 0.065);
      value += Math.sin(2 * Math.PI * chord[k] * 2 * t) * 0.012;
    }
    const beat = t % 1.5;
    const noteIndex = Math.floor(t / 0.75) % melody.length;
    const noteAge = t % 0.75;
    const pluck = Math.exp(-noteAge * 4.2) * Math.sin(2 * Math.PI * melody[noteIndex] * t) * 0.075;
    const fadeIn = Math.min(1, t / 1.2);
    const fadeOut = Math.min(1, (duration - t) / 1.4);
    samples[i] = Math.max(-0.7, Math.min(0.7, (value * pulse + pluck) * fadeIn * fadeOut));
  }
  return floatToWav(samples, sampleRate);
}
function makeTransitionEffects(durationSeconds) {
  const sampleRate = 22050;
  const duration = Math.max(5, Math.min(180, Number(durationSeconds) || 30));
  const count = Math.floor(sampleRate * duration);
  const samples = new Float32Array(count);
  const hitTimes = [];
  for (let t = 3.2; t < duration - 0.25; t += 3.2) hitTimes.push(t);
  for (const hit of hitTimes) {
    const start = Math.floor(hit * sampleRate);
    const length = Math.min(Math.floor(sampleRate * 0.48), count - start);
    for (let j = 0; j < length; j++) {
      const age = j / sampleRate;
      const sweep = Math.sin(2 * Math.PI * (180 + 850 * age) * age);
      const thump = Math.sin(2 * Math.PI * 72 * age) * Math.exp(-age * 14);
      const noise = (Math.sin(j * 12.9898 + start) * 0.5 + Math.sin(j * 78.233) * 0.25);
      const envelope = Math.sin(Math.PI * j / Math.max(1, length)) * Math.exp(-age * 2.8);
      samples[start + j] = Math.max(-0.8, Math.min(0.8, samples[start + j] + (sweep * 0.12 + thump * 0.25 + noise * 0.09) * envelope));
    }
  }
  return floatToWav(samples, sampleRate);
}
async function generateNarration() {
  const text = narrationText.value.trim();
  if (!text || ttsBusy) {
    if (!text) setStatus(voiceStatus, 'Escribe o transcribe primero el guion que quieres narrar.');
    return;
  }
  if (text.length > 5000) {
    setStatus(voiceStatus, 'El guion supera 5,000 caracteres. Divídelo en partes para evitar agotar la memoria del dispositivo.');
    return;
  }
  ttsBusy = true; setBusy(narrationButton, true, 'Generando voz…');
  try {
    const tts = await getTTS();
    const voice = narrationVoice.value || 'em_alex';
    const result = await tts.generate(text, { voice });
    if (!result?.audio || !result?.sampling_rate) throw new Error('El modelo no devolvió audio utilizable.');
    const blob = floatToWav(result.audio, result.sampling_rate);
    const file = new File([blob], 'narracion-masculina.wav', { type: 'audio/wav', lastModified: Date.now() });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const fileInput = $('#narrationFile');
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    const audio = new Audio(URL.createObjectURL(blob));
    audio.controls = true;
    audio.className = 'generated-voice-preview';
    $('#generatedVoicePreview')?.replaceChildren(audio);
    setStatus(voiceStatus, 'Narración generada en este dispositivo y añadida a la pista de voz. Se mezclará cuando exportes el MP4.');
  } catch (error) {
    setStatus(voiceStatus, 'No se pudo generar la voz: ' + (error?.message || 'error desconocido') + ' Revisa la conexión y la memoria disponible. La voz se procesa en tu navegador.');
  } finally {
    ttsBusy = false; setBusy(narrationButton, false);
  }
}
narrationButton?.addEventListener('click', generateNarration);

videoInput?.addEventListener('change', () => {
  activeFile = videoInput.files?.[0] || null;
  resetForFile();
});
const savedLoadButton = $('#loadSavedVideo');
savedLoadButton?.addEventListener('click', () => {
  window.setTimeout(() => {
    // The editor loads the IndexedDB item asynchronously; the preview's metadata event
    // is the reliable signal that a newly selected source is ready.
    if (sourceVideo?.currentSrc) activeFile = null;
  }, 0);
});
sourceVideo?.addEventListener('loadedmetadata', () => {
  // Blob URLs are only used for the preview. Recover the actual file when selected directly;
  // for saved videos the editor dispatches a custom event below.
  if (videoInput?.files?.[0]) activeFile = videoInput.files[0];
});
window.addEventListener('videogpt:file-loaded', (event) => {
  if (event.detail?.file) activeFile = event.detail.file;
  resetForFile();
});
function resetForFile() {
  detectedScenes = [];
  sceneList?.replaceChildren();
  transcriptText.value = '';
  narrationText.value = '';
  useTranscriptButton.disabled = true;
  setStatus(sceneStatus, activeFile ? 'Video listo. Analiza los cambios visuales entre cuadros.' : 'Carga un video para empezar.');
  setStatus(transcriptStatus, activeFile ? 'El audio se transcribirá localmente con un modelo de voz; la primera descarga puede ser grande.' : 'Carga un video para transcribir sus diálogos.');
  setStatus(voiceStatus, 'La voz generada se añadirá como pista al exportar.');
  for (const button of [sceneButton, transcriptButton, narrationButton]) if (button) button.disabled = !activeFile;
}
resetForFile();


// Public, programmatic hooks let the conversational assistant run these tools itself.
// The advanced panel can stay hidden; users do not need to operate it manually.
window.videoGPTAdvancedTools = {
  async configureAutomaticAudio(options = {}) {
    const requested = [];
    const failures = [];
    const duration = Math.max(8, Math.min(180, Number(options.duration) || Number(sourceVideo?.duration) || 30));
    if (options.narration) {
      try {
        narrationVoice.value = 'pm_alex';
        narrationText.value = makeNarrationScript(options.instruction);
        await generateNarration();
        if ($('#narrationFile')?.files?.length) requested.push('voz masculina en español');
        else failures.push('no se pudo generar la voz masculina');
      } catch (error) { failures.push('voz: ' + (error?.message || 'error desconocido')); }
    }
    if (options.music) {
      try {
        assignGeneratedAudio($('#musicFile'), 'musica-ambiental-generada.wav', makeBackgroundMusic(duration));
        const slider = $('#musicVolume');
        if (slider) { slider.value = '25'; slider.dispatchEvent(new Event('input', { bubbles: true })); }
        requested.push('música instrumental de fondo');
      } catch (error) { failures.push('música: ' + (error?.message || 'error desconocido')); }
    }
    if (options.effects) {
      try {
        assignGeneratedAudio($('#effectsFile'), 'efectos-transicion-generados.wav', makeTransitionEffects(duration));
        const slider = $('#effectsVolume');
        if (slider) { slider.value = '65'; slider.dispatchEvent(new Event('input', { bubbles: true })); }
        const offset = $('#effectsOffset');
        if (offset) offset.value = '0';
        requested.push('efectos de transición');
      } catch (error) { failures.push('efectos: ' + (error?.message || 'error desconocido')); }
    }
    return { requested, failures };
  },
  async analyzeScenesAutomatically() {
    await analyzeScenes();
    return lastSceneAnalysisSucceeded ? detectedScenes.map(scene => scene.time) : [];
  },
  async transcribeAutomatically() {
    await transcribeVideo();
    return String(transcriptText?.value || '').trim();
  },
  async narrateAutomatically(text) {
    if (typeof text === 'string' && text.trim()) narrationText.value = text.trim();
    await generateNarration();
    return Boolean(narrationFileInput?.files?.length);
  }
};
