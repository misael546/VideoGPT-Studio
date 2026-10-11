import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const here = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(here, '../public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'VideoGPT Studio', version: '0.1.0' });
});

app.post('/api/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Escribe qué video quieres crear o editar.' });
  if (message.length > 8000) return res.status(413).json({ error: 'La instrucción es demasiado larga (máximo 8.000 caracteres).' });

  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      mode: 'setup',
      reply: 'La interfaz ya está preparada, pero falta configurar OPENAI_API_KEY en el servidor para interpretar solicitudes con IA. Para producir videos reales también habrá que conectar un proveedor de generación/edición de video.',
      project: { prompt: message, status: 'Borrador', outputUrl: null }
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: 'Eres el asistente de VideoGPT Studio. Ayuda a convertir ideas en un plan de video con escenas, estilo, duración y edición. Sé claro sobre los límites: no afirmes que generaste ni exportaste un video. En esta versión solo se prepara el proyecto, salvo que un proveedor de video esté realmente conectado.'
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
      project: { prompt: message, status: 'Plan preparado; video aún no generado', outputUrl: null }
    });
  } catch {
    res.status(502).json({ error: 'No se pudo conectar con el proveedor de IA. Revisa la configuración del servidor.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(here, '../public/index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`[VideoGPT Studio] Servidor listo en el puerto ${port}`);
});
