# VideoGPT Studio

Proyecto independiente para preparar ideas, planes y generación de clips de video con IA.

## Estado inicial
- Interfaz web adaptable a móvil y escritorio.
- Chat de instrucciones y espacio de trabajo.
- Integración inicial con OpenAI Responses API para preparar el plan.
- Integración con Runway API para iniciar generación de video desde texto y consultar el resultado.
- No afirma que un video está terminado hasta recibir un resultado real del proveedor.

## Requisitos
- Node.js 20+
- Clave de API de OpenAI para el asistente de planificación.
- Cuenta de Runway Dev y créditos disponibles para generación de video.

## Ejecutar localmente
```bash
npm install
cp .env.example .env
npm run dev
```
Abre `http://localhost:3000`.

## Variables de entorno
Configúralas solo en el servidor/hosting. Nunca pongas claves privadas en el navegador ni las subas a GitHub.

- `OPENAI_API_KEY`: clave privada de OpenAI.
- `OPENAI_MODEL`: modelo de texto disponible en tu cuenta.
- `RUNWAYML_API_SECRET`: clave privada de Runway Dev.
- `RUNWAY_MODEL`: modelo de video; por defecto `gen4.5`.
- `PORT`: puerto del servidor, por defecto 3000.

## Generación de video
El usuario debe pulsar explícitamente Generar video y confirmar que entiende que puede consumir créditos. La API crea una tarea asíncrona y consulta su estado. El enlace de salida lo entrega el proveedor y puede caducar; descarga los resultados que quieras conservar.

La generación depende de los permisos, modelos, saldo, límites y condiciones de la cuenta Runway. Verifica sus precios antes de probar.

## Publicación en Vercel
1. Importa `misael546/VideoGPT-Studio` desde el panel de Vercel.
2. Mantén el directorio raíz como `.` y configura `OPENAI_API_KEY`, `OPENAI_MODEL`, `RUNWAYML_API_SECRET` y `RUNWAY_MODEL` en Environment Variables. No escribas las claves en archivos públicos ni en el frontend.
3. Despliega. `api/index.js` y `vercel.json` enrutan las peticiones al servidor Express; el mismo servidor sigue pudiéndose ejecutar localmente con `npm run dev`.
4. Comprueba `/api/health` y prueba primero el chat sin iniciar una generación de pago.

**Importante:** este proyecto todavía no incluye inicio de sesión, cuotas persistentes por usuario ni almacenamiento permanente de videos. No habilites la generación pública hasta añadir esas protecciones. Los enlaces del proveedor pueden caducar y no se garantiza conservación del resultado.

## Reglas
Lee `PROJECT_RULES.md` antes de cada actualización.
