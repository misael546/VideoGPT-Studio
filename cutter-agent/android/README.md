# Cutter Studio para Android (primera versión)

Esta carpeta contiene la interfaz móvil de Cutter Studio, separada del motor local de Windows. Puede ejecutarse como PWA en Android o empaquetarse como APK mediante GitHub Actions.

## Funciones actuales

- Mostrar el panel para conectar con el agente de Windows y listar episodios alojados en la PC (la conexión aún no está implementada).
- Presentar el reproductor de previsualización por transmisión y el botón «Crear video en mi PC»; ambos permanecen deshabilitados funcionalmente hasta que exista y se valide el agente remoto.
- Guardar la configuración ligera del proyecto y preparar la interfaz para ordenar episodios que devuelva la PC.
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

La interfaz Android ya presenta los paneles de conexión a la PC, previsualización y creación del vídeo, y elimina el selector de vídeos del teléfono. **La conexión remota, la reproducción real por streaming, el envío de órdenes de renderizado y la actualización del progreso aún deben implementarse y probarse**. El botón de creación se mantiene deshabilitado y no simula un montaje mientras el agente no exista. La detección de openings/endings y el renderizado se ejecutarán en la PC con Python y FFmpeg. No se deben enviar vídeos a servicios remotos.

## Pruebas

Las pruebas de Node validan el guardado/recuperación del proyecto, la restauración del orden y que no existan controles visibles para importar/exportar JSON. Antes de publicar o fusionar, se debe probar el flujo en un dispositivo Android real.
