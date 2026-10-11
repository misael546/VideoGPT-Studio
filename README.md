# VideoGPT Studio

Proyecto independiente para subir videos, conservarlos en una galería local y preparar una edición dirigida por ChatGPT, sin integrar otra IA como asistente principal.

## Sitio y estado real

- Sitio estático publicado con GitHub Pages: https://misael546.github.io/VideoGPT-Studio/
- Página para seleccionar un video: https://misael546.github.io/VideoGPT-Studio/editor.html
- La selección y la galería local usan el almacenamiento del navegador (IndexedDB); el archivo no se sube a un servidor.
- El video no se adjunta automáticamente a la conversación de ChatGPT. Para pedir una edición ahora, adjunta el archivo directamente en tu chat y describe el resultado.
- La conexión directa entre esta conversación y la página **no está implementada ni verificada**. No anunciarla como disponible hasta probar carga segura, autorización, procesamiento y recuperación del archivo final.
- El presupuesto es estrictamente $0. No activar facturación ni invocar APIs que puedan cobrar.

## Flujo objetivo

1. El usuario selecciona un video y lo conserva en su galería del navegador.
2. El usuario adjunta el original directamente a ChatGPT y describe la edición.
3. ChatGPT prepara las instrucciones de edición y decide qué operaciones hacen falta.
4. Un procesador gratuito y determinista (por ejemplo, FFmpeg) ejecuta únicamente operaciones compatibles y validadas; no se integra otra IA para sustituir a ChatGPT.
5. Se valida el archivo exportado y se presenta para descargarlo o guardarlo en la galería.
6. El original nunca se sobrescribe.

Los pasos 3–5 no deben presentarse como automatizados desde la página hasta que exista una integración segura y se pruebe de extremo a extremo. Mientras no exista, el editor local y el intercambio de instrucciones son alternativas parciales, no una conexión directa.

## Generador gratuito de cortos ilustrados

El workflow [Generate free illustrated video](https://github.com/misael546/VideoGPT-Studio/actions/workflows/generate-free-video.yml) crea un corto ilustrado predefinido mediante fotogramas, narración y efectos sonoros sintetizados. No es un modelo generativo de video y no adapta automáticamente cada prompt del sitio a un video personalizado. GitHub Actions tiene límites de uso; no se promete generación ilimitada.

Para ejecutarlo, abre el workflow, pulsa **Run workflow**, espera a que termine y comprueba que el MP4 sea válido antes de publicarlo.

## Biblioteca de recursos

La carpeta `recursos/` organiza imágenes, sonidos, música, plantillas y su catálogo `recursos/catalogo.json`. Solo se incorporan recursos propios o con licencia compatible. Una biblioteca reutilizable no equivale a entrenar un modelo de IA.

La revisión semanal puede detectar rutas rotas, duplicados, procedencia y licencias, y añadir recursos originales útiles. Debe respetar el presupuesto $0 y no afirmar que hubo generación de imágenes si la herramienta no estuvo disponible.

## Desarrollo local

Requisitos: Node.js 20+. Para levantar el servidor:

```bash
npm install
npm run dev
```

El servidor Express contiene rutas heredadas para proveedores externos. No son necesarias para la web estática de GitHub Pages y **no deben usarse** en este proyecto mientras el presupuesto sea $0. Nunca agregues claves, tokens ni credenciales al repositorio.

## Seguridad y pruebas

- No subir archivos del usuario sin consentimiento explícito y una explicación clara.
- No exponer claves privadas al frontend.
- No afirmar que una integración de ChatGPT funciona sin probar autenticación, carga, edición, resultado y descarga.
- Validar entradas y el video final; mostrar errores reales en vez de fingir que la edición terminó.
- No depender de enlaces temporales como almacenamiento permanente.
- Probar la interfaz en móvil y escritorio.


### Worker FFmpeg del mismo origen

El editor y las herramientas avanzadas cargan el worker desde `public/vendor/ffmpeg/worker.js`, junto con sus dependencias locales `const.js` y `errors.js`. Los archivos corresponden a `@ffmpeg/ffmpeg@0.12.10` (licencia MIT); el motor Core/WebAssembly permanece fijado a `@ffmpeg/core@0.12.6` y se descarga bajo demanda. Para refrescar los archivos locales de acuerdo con la versión fijada, ejecuta `npm run prepare:ffmpeg`. El video del usuario continúa procesándose en el navegador.
