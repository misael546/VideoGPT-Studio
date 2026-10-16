# Cutter Studio para Android (primera versión)

Esta carpeta contiene la interfaz móvil de Cutter Studio, separada del motor local de Windows. Puede ejecutarse como PWA en Android o empaquetarse como APK mediante GitHub Actions.

## Funciones actuales

- Seleccionar varios videos desde el selector de archivos de Android.
- Inferir una posible numeración a partir de nombres habituales como `S01E02`, `Episode 02` o `Episodio 02`.
- Cambiar manualmente el orden de salida.
- Definir texto de marca de agua y elegir una imagen como referencia.
- **Guardar automáticamente el orden de episodios y el texto de marca de agua en el almacenamiento local del dispositivo.** No hace falta exportar ni importar JSON manualmente.
- Recuperar los datos guardados al volver a abrir la aplicación y restaurar el orden después de volver a seleccionar los videos originales.
- Guardar en caché los archivos de la interfaz para abrirla sin conexión después de la primera visita.

## Guardado automático y privacidad

El guardado automático almacena solo los nombres, tamaños, orden y metadatos necesarios para reconocer los episodios, además del texto de marca de agua. No copia ni sube el contenido de los videos. Los navegadores no garantizan que la aplicación conserve permisos a los archivos seleccionados después de cerrar la pestaña; por eso, al regresar, se deben volver a seleccionar los videos originales. La imagen de marca de agua también debe seleccionarse de nuevo.

El guardado se mantiene en el mismo dispositivo y navegador/app. Borrar los datos de la aplicación o del navegador puede borrar el proyecto guardado.

## Límites explícitos

Esta primera versión es un acompañante para preparar el proyecto. **Todavía no detecta openings/endings ni corta, une o renderiza videos en Android.** El motor de procesamiento utiliza Python y FFmpeg en Windows. La integración segura entre Android y el motor de PC queda para una etapa posterior. No se envían videos a ningún servicio remoto.

## Pruebas

Las pruebas de Node validan el guardado/recuperación del proyecto, la restauración del orden y que no existan controles visibles para importar/exportar JSON. Antes de publicar o fusionar, se debe probar el flujo en un dispositivo Android real.
