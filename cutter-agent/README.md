# Cutter Studio — agente local

Este componente se ejecuta en el PC del usuario. Los vídeos y los archivos de trabajo permanecen en carpetas locales; no se suben a GitHub ni a servicios externos.

## Inicio rápido en Windows

Abre `INICIAR_CUTTER_STUDIO.bat`. El menú permite analizar la carpeta de episodios y crear el plan revisable, o renderizar después de revisar y aprobar los cortes. El lanzador necesita Python 3.10+ y FFmpeg/FFprobe instalados en PATH. Los informes, la caché y el vídeo final se guardan localmente en las rutas elegidas.


## Requisitos

- Python 3.10 o superior
- FFmpeg y FFprobe instalados y disponibles en `PATH`
- Espacio libre para informes y archivos de salida

## Flujo recomendado

### 1. Inventariar episodios y buscar coincidencias

Desde esta carpeta:

```bash
python cutter.py scan "D:\\Anime\\Temporada 1" --output scan-report.json
```

La primera ejecución crea una caché local oculta `.cutter-studio-cache.json` dentro de la carpeta analizada. Las siguientes reutilizan metadatos y huellas visuales si el tamaño y la fecha de modificación del archivo no cambiaron; así se evita volver a decodificar los mismos vídeos al ajustar el plan. Para forzar un análisis completo usa `--no-cache`; para guardar la caché en otra ruta usa `--cache-file "D:\\CutterCache\\anime.json"`.

El escáner obtiene duración, resolución y tamaño, propone el orden por número de episodio e inspecciona los primeros y últimos 180 segundos. La huella visual combina luminosidad media (aHash) y gradientes horizontales (dHash). Cuando existe una pista de audio, FFmpeg extrae características locales de cuatro bandas de frecuencia; estas ayudan a encontrar música repetida aunque cambien las imágenes. Ambas modalidades comparan secuencias con hasta 15 segundos de desfase, toleran hasta dos muestras discordantes aisladas y registran calidad de coincidencia por modalidad. Cuando visual y audio apuntan a un tramo cercano, sus evidencias se combinan en un candidato. Los límites cercanos al principio/final se pueden ampliar hasta el borde si quedan a 10 segundos o menos, pero siempre se marcan para revisión.

### 2. Crear el plan de edición revisable

```bash
python edit_plan.py create scan-report.json --output edit-plan.json
```

El plan incluye el orden propuesto y los intervalos visualmente coincidentes como candidatos. Cada corte comienza con `"approved": false`; por tanto, **no se elimina nada por defecto**. Abre el JSON, reproduce cada episodio en los tiempos indicados y cambia a `true` solo los intervalos que hayas confirmado que deben eliminarse. Si el nombre de un archivo no es único, el generador no asigna candidatos ambiguos a una ruta.

Los tiempos sugeridos corresponden únicamente al tramo que el escáner logró emparejar. No se asume que ese tramo cubra el opening o ending completo; revisa y ajusta `start_seconds` y `end_seconds` según corresponda. Los intervalos aprobados se eliminarán del episodio; los no aprobados se conservarán.

### 3. Generar un manifiesto de renderizado

Después de revisar y guardar `edit-plan.json`:

```bash
python edit_plan.py render-manifest edit-plan.json --output render-manifest.json
```

El generador convierte los cortes aprobados en los segmentos que deben conservarse. Combina cortes aprobados que se solapan y se detiene si un episodio quedaría completamente vacío. El orden de la lista final sigue el orden del plan.

### 4. Renderizar el vídeo unido

```bash
python render.py render-manifest.json --output "D:\\Anime\\Temporada 1\\temporada-final.mp4" --watermark "D:\\Anime\\marca.png"
```

La marca de agua es opcional. El renderizador normaliza segmentos a MP4 H.264/AAC, 1920×1080, 30 fps y audio estéreo de 48 kHz. Esto puede aumentar el tiempo de procesamiento y cambiar la resolución original; reserva espacio libre suficiente. No sobrescribe una salida existente salvo que se indique `--overwrite`. Los originales se leen, no se editan, y el archivo final solo se coloca en su destino cuando la operación completa termina correctamente.

## Límites y seguridad

- Las coincidencias visuales o de audio son candidatas, no una garantía de que el tramo sea un opening o ending. Nunca se aprueban cortes automáticamente; la música puede aparecer como fondo en otra escena.
- El escáner muestrea una vez por segundo. La huella de audio resume la energía relativa en cuatro bandas de frecuencia; no es reconocimiento musical semántico y puede fallar con remezclas, cortes temporales o cambios de velocidad.
- La caché usa un esquema versionado para invalidar huellas de versiones anteriores automáticamente. Si una extracción de audio falla, se registra en `audio_warnings` y aún pueden usarse las coincidencias visuales.
- La herramienta funciona localmente por línea de comandos. No la ejecutes como servicio público ni abras puertos de red.
- La CI instala FFmpeg y prueba la unión de clips sintéticos con y sin audio, además de validar el plan y sus intervalos.
