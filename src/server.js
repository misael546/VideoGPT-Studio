import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const here = path.dirname(fileURLToPath(import.meta.url));
const RUNWAY_BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VERSION = '2024-11-06';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(here, '../public')));

function runwayHeaders() {
  return {
    Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': RUNWAY_VERSION
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'VideoGPT Studio',
    version: '0.2.0',
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    videoConfigured: Boolean(process.env.RUNWAYML_API_SECRET)
  });
});

app.post('/api/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Escribe qué video quieres crear o editar.' });
  if (message.length > 8000) return res.status(413).json({ error: 'La instrucción es demasiado larga (máximo 8.000 caracteres).' });

  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      mode: 'setup',
      reply: 'Tu idea quedó preparada como borrador. Para recibir un plan detallado debes configurar OPENAI_API_KEY en el servidor. Si conectas Runway y tienes créditos, también podrás solicitar una generación real de video.',
      project: { prompt: message, status: 'Borrador; video no generado', outputUrl: null },
      canGenerate: Boolean(process.env.RUNWAYML_API_SECRET)
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: 'Eres el asistente de VideoGPT Studio. Convierte la idea del usuario en un plan claro de video: escenas, estilo visual, ritmo, encuadre, duración sugerida y audio. Devuelve texto en español. No afirmes que generaste ni exportaste un video; la generación es un paso separado.'
          },
          { role: 'user', content: message }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: data?.error?.message || 'El proveedor de IA no pudo procesar la solicitud.' });
    }
    const reply = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === 'output_text')
      .map(item => item.text)
      .join('\n') || 'No se recibió una respuesta de texto.';
    res.json({
      mode: 'planning',
      reply,
      project: { prompt: message, status: 'Plan preparado; video aún no generado', outputUrl: null },
      canGenerate: Boolean(process.env.RUNWAYML_API_SECRET)
    });
  } catch {
    res.status(502).json({ error: 'No se pudo conectar con el proveedor de IA. Revisa la configuración del servidor.' });
  }
});

app.post('/api/video/generate', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const ratio = typeof req.body?.ratio === 'string' ? req.body.ratio : '1280:720';
  const duration = Number(req.body?.duration || 5);

  if (!prompt) return res.status(400).json({ error: 'Escribe una descripción antes de generar el video.' });
  if (prompt.length > 5000) return res.status(413).json({ error: 'La descripción supera el límite de 5.000 caracteres.' });
  if (!['1280:720', '720:1280', '1104:832', '832:1104', '960:960'].includes(ratio)) {
    return res.status(400).json({ error: 'Formato de video no admitido.' });
  }
  if (![5, 8, 10].includes(duration)) {
    return res.status(400).json({ error: 'La duración debe ser de 5, 8 o 10 segundos.' });
  }
  if (!process.env.RUNWAYML_API_SECRET) {
    return res.status(503).json({ error: 'La generación real todavía no está activada. Configura RUNWAYML_API_SECRET en el servidor con una clave de Runway Dev.' });
  }

  try {
    const response = await fetch(`${RUNWAY_BASE}/image_to_video`, {
      method: 'POST',
      headers: runwayHeaders(),
      body: JSON.stringify({
        model: process.env.RUNWAY_MODEL || 'gen4.5',
        promptText: prompt,
        ratio,
        duration
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: data?.error || data?.message || 'Runway no pudo iniciar la tarea. Revisa la clave, los créditos y los parámetros.' });
    }
    if (!data.id) return res.status(502).json({ error: 'Runway no devolvió un identificador de tarea válido.' });
    res.status(202).json({ taskId: data.id, status: 'PENDING', message: 'Runway aceptó la solicitud. La generación puede tardar y consumir créditos.' });
  } catch {
    res.status(502).json({ error: 'No se pudo conectar con Runway. Inténtalo de nuevo más tarde.' });
  }
});

app.get('/api/video/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(taskId)) {
    return res.status(400).json({ error: 'Identificador de tarea no válido.' });
  }
  if (!process.env.RUNWAYML_API_SECRET) {
    return res.status(503).json({ error: 'La generación de video no está configurada en el servidor.' });
  }
  try {
    const response = await fetch(`${RUNWAY_BASE}/tasks/${encodeURIComponent(taskId)}`, {
      headers: runwayHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: data?.error || data?.message || 'No se pudo consultar el estado del video.' });
    }
    const output = Array.isArray(data.output) ? data.output[0] : null;
    res.json({
      taskId,
      status: data.status || 'PROCESSING',
      outputUrl: data.status === 'SUCCEEDED' && typeof output === 'string' ? output : null,
      failure: data.status === 'FAILED' ? (data.failure || 'El proveedor indicó que la generación falló.') : null
    });
  } catch {
    res.status(502).json({ error: 'Error de conexión al consultar el estado del video.' });
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
