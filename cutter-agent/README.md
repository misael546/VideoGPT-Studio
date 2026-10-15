# Cutter Studio — agente local

Este componente se ejecuta en el PC del usuario. Los vídeos y los archivos de trabajo permanecen en carpetas locales; no se suben a GitHub ni a servicios externos.

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

El escáner obtiene duración, resolución y tamaño, calcula huellas visuales de los primeros y últimos 180 segundos y compara secuencias con hasta 15 segundos de desfase. Propone el orden por número de episodio cuando puede inferirlo del nombre. Los tiempos reportados son segundos desde el inicio de cada episodio.

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

- Las coincidencias visuales son candidatas, no una garantía de que el tramo sea un opening o ending.
- El análisis actual toma muestras visuales a un fotograma por segundo; todavía no analiza huellas de audio y puede fallar si cambian el montaje, el logo o el recorte.
- La herramienta funciona localmente por línea de comandos. No la ejecutes como servicio público ni abras puertos de red.
- La CI instala FFmpeg y prueba la unión de clips sintéticos con y sin audio, además de validar el plan y sus intervalos.
