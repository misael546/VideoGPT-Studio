# Cutter Studio para Android (primera versión)

Esta carpeta contiene una interfaz móvil instalable tipo PWA, separada del motor local de Windows. Se diseñó para teléfonos Android y puede instalarse desde el navegador cuando se sirva por HTTPS.

## Funciones actuales

- Seleccionar varios videos desde el selector de archivos de Android.
- Inferir una posible numeración a partir de nombres habituales como `S01E02`, `Episode 02` o `Episodio 02`, y proponer el orden.\n- Mantener el orden manual después de mover capítulos; el orden inicial por nombre solo es una sugerencia.
- Cambiar manualmente el orden de salida.
- Definir texto de marca de agua y elegir una imagen como referencia.
- Exportar un JSON con el orden y los ajustes, sin incluir ni subir los videos.\n- Volver a importar ese JSON después de seleccionar de nuevo los videos, para recuperar el orden y el texto de la marca de agua. La imagen de marca de agua se debe volver a seleccionar.
- Guardar en caché los archivos de la interfaz para abrirla sin conexión después de la primera visita.

## Límites explícitos

Esta primera versión es un acompañante para preparar el proyecto. **No detecta todavía openings/endings, no corta ni une videos y no genera el MP4 final en Android.** El motor existente utiliza Python y FFmpeg en Windows. La integración con ese motor y una APK nativa son etapas posteriores. No se envían videos a ningún servicio remoto.

## Abrir y probar

Sirve esta carpeta mediante un servidor HTTPS estático y abre index.html desde Chrome en Android. En un sitio HTTPS, usa el menú de Chrome y elige «Instalar aplicación» o «Añadir a pantalla de inicio» (la opción depende del dispositivo). Para desarrollo local, sirve esta carpeta con cualquier servidor estático.

El archivo exportado es un manifiesto de nombres/orden y opciones, no contiene rutas accesibles desde Windows ni los propios videos. Por tanto, todavía no se puede importar directamente al motor de escritorio sin implementar el puente de transferencia de proyectos.

## Próximas etapas

1. Validar la interfaz en pantallas Android reales y mejorar el orden/nombres detectados.
2. Definir un formato de proyecto común con el motor Windows.
3. Implementar un puente local seguro y explícito entre el móvil y el PC, sin abrir el motor a Internet.
4. Evaluar empaquetado como APK después de validar el flujo y los permisos.
