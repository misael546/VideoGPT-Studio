# VideoGPT Studio

Proyecto independiente para crear y editar proyectos de video mediante instrucciones en lenguaje natural.

## Estado inicial
- Interfaz web adaptable a móvil y escritorio.
- Chat de instrucciones con vista previa de proyecto.
- API Node.js para integrar un proveedor de IA y un servicio de generación/edición de video.
- No incluye claves secretas ni finge generar un video final: sin configurar un proveedor, la API explica qué falta.

## Requisitos
- Node.js 20+
- Una clave de API del proveedor de IA que elijas.
- Un proveedor/modelo de video compatible si quieres generar clips reales.

## Ejecutar
```bash
npm install
cp .env.example .env
npm run dev
```
Abre `http://localhost:3000`.

## Configuración
Rellena `.env` en el servidor. Nunca pongas claves privadas en archivos del navegador ni las subas a GitHub.

- `OPENAI_API_KEY`: opcional, para habilitar interpretación de instrucciones mediante OpenAI.
- `OPENAI_MODEL`: modelo disponible en tu cuenta, por ejemplo `gpt-4.1-mini`.
- `VIDEO_PROVIDER_URL`: endpoint del proveedor de video, si se integra.
- `VIDEO_PROVIDER_API_KEY`: clave del proveedor de video.

La disponibilidad de generación de video depende del proveedor y del acceso contratado. La primera versión deja preparado el flujo y la interfaz; no afirma que un video esté generado hasta que un proveedor real devuelva un resultado.

## Estructura
- `public/`: interfaz web.
- `src/server.js`: servidor y API.
- `.env.example`: variables de entorno de ejemplo.
- `PROJECT_RULES.md`: reglas para futuras actualizaciones.
