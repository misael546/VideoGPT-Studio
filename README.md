# VideoGPT Studio

Proyecto independiente para preparar ideas y reproducir videos.

## Estado

- Interfaz web adaptable a móvil y escritorio.
- Prototipo de planificación y generación existente con Agnes AI.
- Endpoints protegidos para integraciones externas.
- **Generador gratuito sin API**: crea un corto ilustrado con movimiento de cámara, textos en español, narración sintetizada y sonido ambiental usando Python, Pillow, FFmpeg y eSpeak NG.
- Existe un flujo Veo experimental, pero requiere acceso al modelo y puede generar cargos; no es el flujo recomendado para un presupuesto de $0.
- Ningún video se considera terminado hasta que exista el archivo final y se valide correctamente.

## Crear un video gratis

1. Abre la pestaña **Actions** del repositorio.
2. Selecciona **Generate free illustrated video**.
3. Pulsa **Run workflow** y confirma.
4. Al terminar, el flujo valida el MP4 y lo guarda en `public/videos/isekai-test.mp4` mediante un commit.

Workflow: [Generate free illustrated video](.github/workflows/generate-free-video.yml)

Este modo no requiere `GEMINI_API_KEY`, claves de Agnes ni facturación. Genera un corto ilustrado; no usa un modelo generativo de video y, por tanto, no produce el mismo tipo de realismo que Veo. GitHub Actions puede estar sujeto a los límites de uso de la cuenta, así que el proyecto no promete ejecuciones ilimitadas.

## Ejecutar el generador gratuito localmente

Requisitos: Python 3.12+, Pillow, FFmpeg y eSpeak NG.

```bash
python -m pip install Pillow
python scripts/generate-free-isekai.py
```

El MP4 se escribe en `public/videos/isekai-test.mp4`. No requiere credenciales.

## Generador experimental con Google Veo

El script `scripts/generate-isekai.mjs` intenta crear cuatro clips con Google Veo 3.1 Fast y unirlos con FFmpeg. Requiere acceso al modelo y una clave válida de Google AI. Puede generar cargos y fallar por cuota o disponibilidad.

**No ejecutar este flujo con el presupuesto actual de $0.** La clave, si alguna vez se autoriza su uso, debe guardarse solo como secreto de GitHub `GEMINI_API_KEY`; nunca en archivos, commits, issues ni en el chat.

## Ejecutar el servidor web localmente

```bash
npm install
cp .env.example .env
npm run dev
```

Abre `http://localhost:3000`.

## Variables de entorno del servidor

Configúralas solo en el hosting. Nunca pongas claves privadas en el navegador ni las subas a GitHub.

- `AGNES_API_KEY`: clave privada de Agnes AI para funciones existentes; verifica límites y posibles costos antes de usarla.
- `AGNES_API_BASE`: base de API de Agnes AI.
- `AGNES_TEXT_MODEL`: modelo de chat de Agnes AI.
- `AGNES_VIDEO_MODEL`: modelo de video de Agnes AI.
- `VIDEOGPT_ASSISTANT_TOKEN`: secreto de integración externa.
- `PORT`: puerto local, por defecto 3000.

## Publicación en Vercel

1. Importa `misael546/VideoGPT-Studio` desde Vercel.
2. Configura solo las variables necesarias para las funciones que realmente vayas a usar.
3. Despliega la rama aprobada.
4. Comprueba `/api/health` y prueba las rutas relevantes.

Antes de habilitar uso público, añade autenticación, cuotas persistentes por usuario, limitación de solicitudes y almacenamiento permanente. No prometas generación ilimitada.

## Integración segura para un asistente externo

El archivo `assistant-openapi.yaml` documenta endpoints protegidos para iniciar una generación y consultar el estado hasta obtener un enlace real. Esto permite configurar una integración de acciones en un asistente compatible; **no conecta automáticamente esta conversación de ChatGPT**.

Para habilitarla, configura un secreto largo en `VIDEOGPT_ASSISTANT_TOKEN` en el hosting y conserva las claves de proveedores como secretos del servidor. No envíes tokens al navegador. La API aún no implementa cuentas de usuario ni cuotas persistentes, así que no la publiques como servicio abierto.

Lee `PROJECT_RULES.md` antes de cada actualización.
