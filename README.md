# VideoGPT Studio

Proyecto independiente para preparar ideas y reproducir videos generados con IA.

## Estado
- Interfaz web adaptable a móvil y escritorio.
- Prototipo de planificación y generación existente con Agnes AI.
- Endpoints protegidos para integraciones externas.
- Flujo experimental manual para crear un corto isekai por cuatro escenas con Google Veo 3.1 Fast, unirlas con FFmpeg y guardar el MP4 en el repositorio.
- Ningún video se considera terminado hasta que exista el archivo final y la generación haya concluido correctamente.

## Requisitos
- Node.js 20+
- Para el generador experimental: clave de Google Gemini API con acceso al modelo de video Veo 3.1 Fast.
- FFmpeg para normalizar y unir clips.

## Ejecutar localmente
```bash
npm install
cp .env.example .env
npm run dev
```
Abre `http://localhost:3000`.

## Generador experimental del corto isekai

El script `scripts/generate-isekai.mjs` crea cuatro clips de fantasía anime, los normaliza a 1280x720 y los une en `public/videos/isekai-test.mp4`.

### Configuración segura
1. En GitHub, abre **Settings → Secrets and variables → Actions**.
2. Crea el secreto `GEMINI_API_KEY` con tu clave privada de Google AI. No la escribas en archivos, commits, issues ni en el chat.
3. En **Actions**, ejecuta **Generate isekai test video** manualmente y elige `sí` para confirmar que autorizas una operación que puede consumir créditos.
4. El flujo genera cuatro clips de hasta 8 segundos cada uno. El modelo, la disponibilidad, el precio y el tiempo de espera dependen de Google; el flujo no se ejecutará si no confirmas la generación.
5. Si finaliza correctamente, el MP4 se guarda en `public/videos/isekai-test.mp4` y se añade un commit a la rama seleccionada en Actions.

El video se almacena en GitHub para pruebas; Git no es almacenamiento multimedia optimizado y los archivos grandes pueden hacer crecer el repositorio. Para uso continuo, conviene guardar los MP4 en almacenamiento de objetos y conservar en GitHub solo los metadatos y enlaces.

### Ejecutar el script localmente
Instala FFmpeg, instala las dependencias con `npm install`, configura `GEMINI_API_KEY` en el entorno local y ejecuta:
```bash
node scripts/generate-isekai.mjs
```
No subas archivos `.env` ni claves.

## Variables de entorno del servidor
Configúralas solo en el hosting. Nunca pongas claves privadas en el navegador ni las subas a GitHub.

- `AGNES_API_KEY`: clave privada de Agnes AI para las funciones existentes.
- `AGNES_API_BASE`: base de API de Agnes AI.
- `AGNES_TEXT_MODEL`: modelo de chat de Agnes AI.
- `AGNES_VIDEO_MODEL`: modelo de video de Agnes AI.
- `VIDEOGPT_ASSISTANT_TOKEN`: secreto de integración externa.
- `PORT`: puerto local, por defecto 3000.

## Publicación en Vercel
1. Importa `misael546/VideoGPT-Studio` desde Vercel.
2. Configura las variables de entorno requeridas para las funciones que realmente vayas a usar.
3. Despliega la rama aprobada.
4. Comprueba `/api/health` y prueba las rutas relevantes.

**Antes de habilitar uso público:** añade autenticación, cuotas persistentes por usuario, limitación de solicitudes y almacenamiento permanente. No prometas generación ilimitada.

## Integración segura para un asistente externo

El archivo `assistant-openapi.yaml` documenta endpoints protegidos para iniciar una generación y consultar el estado hasta obtener un enlace real. Esto permite configurar una integración de acciones en un asistente compatible; **no conecta automáticamente esta conversación de ChatGPT**.

Para habilitarla, configura un secreto largo en `VIDEOGPT_ASSISTANT_TOKEN` en el hosting y conserva `AGNES_API_KEY` como secreto de servidor. No envíes tokens al navegador. La API aún no implementa cuentas de usuario ni cuotas persistentes, así que no la publiques como servicio abierto.

Lee `PROJECT_RULES.md` antes de cada actualización.
