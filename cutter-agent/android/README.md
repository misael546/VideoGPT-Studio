# Cutter Studio para Android (primera versión)

Esta carpeta contiene la interfaz móvil de Cutter Studio, separada del motor local de Windows. Puede ejecutarse como PWA en Android o empaquetarse como APK mediante GitHub Actions.

## Funciones actuales

- Preparar y ordenar episodios mediante metadatos del proyecto.
- Inferir una posible numeración a partir de nombres habituales como `S01E02`, `Episode 02` o `Episodio 02`.
- Cambiar manualmente el orden de salida.
- Definir texto de marca de agua y elegir una imagen como referencia.
- **Guardar automáticamente el orden y la configuración ligera del proyecto.** No hace falta exportar ni importar JSON manualmente.
- Recuperar los datos guardados al volver a abrir la aplicación.
- Guardar en caché los archivos de la interfaz para abrirla sin conexión después de la primera visita.

## Arquitectura obligatoria: PC como almacén y motor de vídeo

**Los vídeos originales deben permanecer en la PC, nunca almacenarse en el teléfono Android.** La APK será un control remoto: mostrará una vista previa transmitida por la PC, enviará órdenes de revisión/edición y recibirá el estado del trabajo. Python, FFmpeg/FFprobe, el escaneo, las cachés pesadas, los episodios y el resultado final vivirán en la PC.

La vista previa debe usar transmisión por fragmentos con búsqueda por tiempo y calidad ajustable; no debe descargar el archivo original completo ni crear una copia persistente en Android. El almacenamiento temporal del reproductor debe limitarse y limpiarse al cerrar o cambiar de episodio. El MP4 final se guarda en la PC y se reproduce desde allí mediante streaming.

La conexión PC-móvil debe autenticarse y cifrarse. En la primera etapa se puede usar una red local privada; para acceso fuera de casa, usar una VPN/túnel privado autenticado, sin abrir un puerto público sin protección. No exponer el actual servidor de revisión `127.0.0.1` directamente a Internet. El puente remoto debe validar rutas, tamaños, permisos y cada acción solicitada.

El guardado automático de Android contiene únicamente información ligera del proyecto (orden, nombres/identificadores y preferencias), nunca bytes de vídeo.

El guardado se mantiene en el mismo dispositivo y navegador/app. Borrar los datos de la aplicación o del navegador puede borrar el proyecto guardado.

## Límites explícitos

La APK actual todavía es una base de preparación del proyecto; **la visualización remota desde la PC y la integración segura con el motor local aún deben implementarse y probarse**. No debe simularse esa función seleccionando o copiando vídeos al Android. La detección de openings/endings y el renderizado se ejecutarán en la PC con Python y FFmpeg. No se deben enviar vídeos a servicios remotos.

## Pruebas

Las pruebas de Node validan el guardado/recuperación del proyecto, la restauración del orden y que no existan controles visibles para importar/exportar JSON. Antes de publicar o fusionar, se debe probar el flujo en un dispositivo Android real.
