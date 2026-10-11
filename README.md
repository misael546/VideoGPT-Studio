# VideoGPT Studio

Proyecto independiente para preparar ideas, planes y generación de clips de video con IA.

## Estado
- Interfaz web adaptable a móvil y escritorio.
- Chat de planificación conectado a Agnes AI.
- Generación de video desde texto mediante la API de Agnes AI.
- Consulta asíncrona del estado y reproducción/enlace del video cuando el proveedor confirma que terminó.
- No afirma que un video está terminado sin una respuesta confirmada del proveedor y una URL válida.

## Requisitos
- Node.js 20+
- Una clave de API de Agnes AI habilitada para chat y video.

## Ejecutar localmente
```bash
npm install
cp .env.example .env
npm run dev
```
Abre `http://localhost:3000`.

## Variables de entorno
Configúralas solo en el servidor/hosting. Nunca pongas claves privadas en el navegador ni las subas a GitHub.

- `AGNES_API_KEY`: clave privada de Agnes AI.
- `AGNES_API_BASE`: base de API; por defecto `https://apihub.agnes-ai.com`.
- `AGNES_TEXT_MODEL`: modelo de chat; por defecto `agnes-3.0-flash`.
- `AGNES_VIDEO_MODEL`: modelo de video; por defecto `agnes-video-2.5-flash`.
- `PORT`: puerto local, por defecto 3000.

## Generación de video
El usuario debe pulsar explícitamente Generar video y confirmar el envío a Agnes AI. La solicitud es asíncrona. Se consulta el estado del proveedor y solo se muestra como terminado cuando se recibe el estado completado y una URL de salida válida. Los enlaces del proveedor pueden caducar; descarga los resultados que quieras conservar.

El proveedor puede imponer cuotas, límites de frecuencia, condiciones de acceso o cambios de disponibilidad en su nivel gratuito. No se garantiza generación ilimitada ni disponibilidad permanente.

## Publicación en Vercel
1. Importa `misael546/VideoGPT-Studio` desde el panel de Vercel.
2. En **Settings → Environment Variables**, añade `AGNES_API_KEY` con tu clave privada. Opcionalmente configura `AGNES_API_BASE`, `AGNES_TEXT_MODEL` y `AGNES_VIDEO_MODEL`. No escribas la clave en archivos públicos ni en el frontend.
3. Despliega la rama aprobada. `api/index.js` y `vercel.json` enrutan las peticiones al servidor Express.
4. Comprueba `/api/health`, después prueba el chat y por último una generación corta.

**Antes de habilitar uso público:** este prototipo aún no incluye inicio de sesión, cuotas persistentes por usuario ni almacenamiento permanente de videos. Añade estas protecciones antes de ofrecerlo públicamente. Los enlaces del proveedor pueden caducar.

## Reglas
Lee `PROJECT_RULES.md` antes de cada actualización.


## Integración segura para un asistente externo

El archivo `assistant-openapi.yaml` documenta endpoints protegidos para iniciar una generación y consultar el estado hasta obtener el enlace real. Esto permite configurar una integración de acciones en un asistente compatible; **no conecta automáticamente esta conversación de ChatGPT**.

Para habilitarla en el hosting:
1. Genera un secreto largo y aleatorio para `VIDEOGPT_ASSISTANT_TOKEN` y guárdalo únicamente en las variables de entorno de Vercel. No lo subas a GitHub ni lo pegues en el frontend.
2. Conserva `AGNES_API_KEY` como secreto del servidor.
3. Despliega la versión que contiene esta integración.
4. En un asistente compatible con acciones/OpenAPI, importa `assistant-openapi.yaml` y configura autenticación Bearer con el mismo secreto.
5. Prueba primero el endpoint de estado y después una única generación corta. La llamada de creación puede consumir créditos; no la repitas si Agnes AI responde que la cola está llena.

Endpoints protegidos:
- `POST /api/assistant/videos`: crea una tarea y devuelve `taskId`.
- `GET /api/assistant/videos/{id}`: consulta la tarea; solo devuelve `outputUrl` si el proveedor confirma éxito y proporciona una URL HTTP(S) válida.

El token no se incluye en el navegador y se compara en tiempo constante. Rota el secreto si se expone. La API aún no implementa cuentas de usuario ni cuotas persistentes, así que no la publiques como servicio abierto.
