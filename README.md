# VideoGPT Studio

Web estática independiente para preparar ideas y reproducir videos.

## Arquitectura actual

- **Sitio web:** GitHub Pages publica el contenido de `public/`.
- **Generación gratuita:** GitHub Actions ejecuta `Generate free illustrated video`.
- **Almacenamiento de prueba:** los MP4 pequeños se guardan en `public/videos/` y se registran en `public/videos/gallery.json`.
- **Sin dependencia de Vercel ni de claves API pagadas.**

Sitio esperado: https://misael546.github.io/VideoGPT-Studio/

## Crear el corto gratuito

1. Abre la pestaña [Actions](https://github.com/misael546/VideoGPT-Studio/actions/workflows/generate-free-video.yml).
2. Pulsa **Run workflow** y confirma.
3. Espera a que termine correctamente.
4. El workflow valida el MP4 y lo guarda en el repositorio. El cambio en `public/` inicia la publicación del sitio en GitHub Pages.

El generador actual crea un corto ilustrado predefinido con fotogramas, narración en español y efectos sonoros sintetizados. No es un modelo de video generativo y todavía no convierte cada prompt de la página en un video personalizado. GitHub Actions está sujeto a límites de uso; no se promete generación ilimitada.

## Galería

Cada video debe tener un nombre único dentro de `public/videos/`. Añade una entrada independiente a `public/videos/gallery.json` con `title`, `description` y `src`. No reemplaces videos anteriores sin intención explícita. Valida el MP4 antes de publicarlo.

La galería es un catálogo estático; no es una función de subida desde el navegador. GitHub es almacenamiento de prueba para MP4 pequeños, no un servicio multimedia optimizado para tráfico público alto.

## Publicación inicial de GitHub Pages

En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación si aún no está configurado. Después, ejecuta el workflow [Publish VideoGPT Studio on GitHub Pages](https://github.com/misael546/VideoGPT-Studio/actions/workflows/pages.yml) o haz un cambio en `public/`.

## Ejecutar localmente

Requisitos: Node.js 20+, Python 3.12+, Pillow, FFmpeg y eSpeak NG para generar el corto localmente.

```bash
npm install
npm run dev
```

Para ejecutar el generador local:

```bash
python -m pip install Pillow edge-tts
python scripts/generate-free-isekai.py
```

## Presupuesto y seguridad

El presupuesto del proyecto es estrictamente $0. No activar facturación ni llamar APIs que puedan generar cargos. El flujo experimental de Veo y los endpoints antiguos de proveedores no forman parte del camino activo de la web.
