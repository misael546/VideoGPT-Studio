import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const here = path.dirname(fileURLToPath(import.meta.url));
const AGNES_BASE = (process.env.AGNES_API_BASE || 'https://apihub.agnes-ai.com').replace(/\/$/, '');
const VIDEO_MODEL = process.env.AGNES_VIDEO_MODEL || 'agnes-video-2.5-flash';
const TEXT_MODEL = process.env.AGNES_TEXT_MODEL || 'agnes-3.0-flash';

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(here, '../public')));

function agnesHeaders() {
  return {
    Authorization: `Bearer ${process.env.AGNES_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function readProviderResponse(response) {
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.error || data?.message || `El proveedor respondió HTTP ${response.status}.`;
    throw new Error(typeof message === 'string' ? message : 'El proveedor no pudo procesar la solicitud.');
  }
  return data;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'VideoGPT Studio',
    version: '0.3.0',
    aiConfigured: Boolean(process.env.AGNES_API_KEY),
    videoConfigured: Boolean(process.env.AGNES_API_KEY),
    provider: 'Agnes AI'
  });
});

app.post('/api/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Escribe qué video quieres crear o editar.' });
  if (message.length > 8000) return res.status(413).json({ error: 'La instrucción es demasiado larga (máximo 8.000 caracteres).' });
  if (!process.env.AGNES_API_KEY) {
    return res.status(503).json({
      error: 'Falta configurar AGNES_API_KEY en las variables de entorno del servidor.',
      canGenerate: false
    });
  }

  try {
    const response = await fetch(`${AGNES_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: agnesHeaders(),
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Eres el asistente de VideoGPT Studio. Convierte la idea del usuario en un plan claro de video: concepto, escenas, estilo visual, movimiento de cámara, ritmo, encuadre, duración sugerida y audio. Responde en español, con pasos concretos. No afirmes que generaste ni exportaste un video; la generación es un paso separado.'
          },
          { role: 'user', content: message }
        ],
        temperature: 0.7
      })
    });
    const data = await readProviderResponse(response);
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      return res.status(502).json({ error: 'Agnes AI respondió, pero no devolvió un plan de texto válido.' });
    }
    res.json({
      mode: 'planning',
      reply: reply.trim(),
      project: { prompt: message, status: 'Plan preparado; video aún no generado', outputUrl: null },
      canGenerate: true
    });
  } catch (error) {
    res.status(502).json({ error: error.message || 'No se pudo conectar con Agnes AI. Revisa la clave y los límites de la cuenta.' });
  }
});

app.post('/api/video/generate', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const ratioValue = typeof req.body?.ratio === 'string' ? req.body.ratio : '1280:720';
  const duration = Number(req.body?.duration || 5);
  const aspectRatio = ({ '1280:720': '16:9', '720:1280': '9:16' })[ratioValue];

  if (!prompt) return res.status(400).json({ error: 'Escribe una descripción antes de generar el video.' });
  if (prompt.length > 5000) return res.status(413).json({ error: 'La descripción supera el límite de 5.000 caracteres.' });
  if (!aspectRatio) return res.status(400).json({ error: 'Formato de video no admitido.' });
  if (!Number.isInteger(duration) || duration < 4 || duration > 12) {
    return res.status(400).json({ error: 'La duración admitida por Agnes Video es de 4 a 12 segundos.' });
  }
  if (!process.env.AGNES_API_KEY) {
    return res.status(503).json({ error: 'Falta configurar AGNES_API_KEY en las variables de entorno del servidor.' });
  }

  try {
    const response = await fetch(`${AGNES_BASE}/v1/videos`, {
      method: 'POST',
      headers: agnesHeaders(),
      body: JSON.stringify({
        model: VIDEO_MODEL,
        prompt,
        mode: 'text',
        seconds: String(duration),
        size: '720P',
        aspect_ratio: aspectRatio,
        n: 1
      })
    });
    const data = await readProviderResponse(response);
    const taskId = data?.video_id || data?.id || data?.task_id;
    if (typeof taskId !== 'string' || !taskId) {
      return res.status(502).json({ error: 'Agnes AI no devolvió un identificador de video válido.' });
    }
    res.status(202).json({
      taskId,
      model: VIDEO_MODEL,
      status: data.status || 'queued',
      message: 'Agnes AI aceptó la solicitud. La tarea puede tardar y está sujeta a los límites de la cuenta.'
    });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Agnes AI no pudo iniciar la generación.' });
  }
});

app.get('/api/video/tasks/:id', async (req, res) => {
  const videoId = req.params.id;
  if (!/^[a-zA-Z0-9_-]{3,160}$/.test(videoId)) {
    return res.status(400).json({ error: 'Identificador de tarea no válido.' });
  }
  if (!process.env.AGNES_API_KEY) {
    return res.status(503).json({ error: 'Falta configurar AGNES_API_KEY en el servidor.' });
  }

  try {
    const url = new URL(`${AGNES_BASE}/agnesapi`);
    url.searchParams.set('video_id', videoId);
    url.searchParams.set('model_name', VIDEO_MODEL);
    const response = await fetch(url, { headers: agnesHeaders() });
    const data = await readProviderResponse(response);
    const providerStatus = String(data.status || 'queued').toLowerCase();
    const outputUrl = typeof data.url === 'string' ? data.url : (typeof data.output_url === 'string' ? data.output_url : null);
    let status = 'PROCESSING';
    if (['completed', 'succeeded', 'success'].includes(providerStatus)) status = outputUrl ? 'SUCCEEDED' : 'PROCESSING';
    if (['failed', 'error'].includes(providerStatus)) status = 'FAILED';
    if (['canceled', 'cancelled'].includes(providerStatus)) status = 'CANCELED';
    res.json({
      taskId: videoId,
      status,
      progress: Number.isFinite(Number(data.progress)) ? Number(data.progress) : null,
      outputUrl: status === 'SUCCEEDED' && outputUrl ? outputUrl : null,
      failure: status === 'FAILED' ? (data.error?.message || data.error || 'Agnes AI indicó que la generación falló.') : null
    });
  } catch (error) {
    res.status(502).json({ error: error.message || 'No se pudo consultar el estado del video.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(here, '../public/index.html')));

export default app;

// Start a local server only when this file is executed directly.
// Vercel imports the Express app through api/index.js instead.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[VideoGPT Studio] Servidor listo en el puerto ${port}`);
  });
}
