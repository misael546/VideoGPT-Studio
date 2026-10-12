# Biblioteca de recursos de VideoGPT Studio

Esta carpeta contiene recursos reutilizables para enriquecer videos sin mezclar archivos de otros proyectos.

## Categorías

- `imagenes/personajes/`: personajes, criaturas, poses y expresiones.
- `imagenes/escenarios/`: fondos y ambientes.
- `imagenes/objetos/`: utilería y elementos transparentes.
- `sonidos/efectos/`: efectos sonoros.
- `sonidos/ambientes/`: ambientes y atmósferas.
- `musica/`: pistas con licencia compatible.
- `plantillas/`: referencias de composición, títulos y secuencias.

## Catálogo

Edita `catalogo.json` para registrar cada recurso. Usa rutas relativas a la raíz del repositorio, etiquetas descriptivas y los tipos admitidos. El generador gratuito ya consulta las entradas de tipo `image_overlay`: si una imagen registrada existe, puede componerla sobre una escena compatible. Los recursos todavía no registrados o inexistentes se omiten de forma segura.

## Reglas

- Usa recursos propios, de dominio público o con licencia que permita su uso.
- No incluyas material privado, credenciales ni archivos de otros juegos/proyectos.
- Optimiza imágenes y audio para evitar inflar el repositorio.
- No guardes MP4 finales aquí; los videos van en `public/videos/` y su catálogo en `public/videos/gallery.json`.
- La biblioteca ayuda al generador a combinar mejores recursos; no entrena automáticamente un modelo de IA.

## Validación automática

Antes de generar un video, ejecuta `python scripts/validate-resource-library.py`. La validación revisa IDs y rutas duplicadas, licencias/procedencia declaradas, SVG sin referencias externas, escenas compatibles, tamaños, rutas de galería y separación entre recursos y videos finales.
