# Cutter Studio — agente local

Este componente está pensado para ejecutarse en el PC del usuario. Los vídeos permanecen en carpetas locales; no se suben a GitHub ni a servicios externos.

## Requisitos

- Python 3.10 o superior
- FFmpeg y FFprobe instalados y disponibles en `PATH`
- Espacio libre para informes y archivos de salida

## Primer uso

Desde esta carpeta:

```bash
python cutter.py scan "D:\\Anime\\Temporada 1" --output scan-report.json
```

El escaneo:
- localiza vídeos compatibles en la carpeta (sin recorrer subcarpetas por defecto);
- obtiene duración, resolución y tamaño con FFprobe;
- calcula huellas visuales ligeras en los primeros y últimos 180 segundos;
- compara muestras con tolerancia de hasta 15 segundos de desfase y informa secuencias visualmente parecidas como **candidatas** a opening/ending, con offsets separados para cada episodio;
- propone un orden por número de episodio cuando puede inferirlo del nombre;
- expresa los tiempos de las coincidencias de ending como segundos desde el inicio del episodio, no desde el comienzo de la ventana final.

No recorta ni modifica originales. Las coincidencias son sugerencias para revisar, no una garantía de que una secuencia sea opening/ending. El informe no se publica ni se envía a ninguna parte.

## Límites iniciales

La detección compara muestras visuales de un fotograma por segundo y puede fallar con openings que tengan montaje variable, logos distintos, episodios recortados o escenas parecidas. El análisis de audio, la revisión visual guiada, el recorte automático, la unión y la marca de agua se incorporarán en fases posteriores, con pruebas antes de habilitarlos.

No ejecutar el agente como servicio público ni abrir puertos de red. Esta primera versión es una herramienta de línea de comandos local.

## Renderizado de un plan revisado

El renderizador todavía **no corta automáticamente** las candidatas del escáner. Primero debes revisar los tiempos y preparar un JSON manual, por ejemplo:

```json
{
  "schema": "cutter-studio-render/v1",
  "episodes": [
    {
      "path": "D:/Anime/Temporada 1/Episodio 01.mkv",
      "start_seconds": 84.5,
      "end_seconds": 1320
    },
    {
      "path": "D:/Anime/Temporada 1/Episodio 02.mkv",
      "start_seconds": 83,
      "end_seconds": 1317
    }
  ]
}
```

Los intervalos son los segmentos que quieres conservar. Los episodios se unirán en el orden de la lista. Después:

```bash
python render.py plan.json --output "D:\\Anime\\Temporada 1\\temporada-final.mp4" --watermark "D:\\Anime\\marca.png"
```

La marca de agua es opcional. El renderizador normaliza los segmentos a MP4 H.264/AAC de 1920×1080, 30 fps y audio estéreo de 48 kHz para poder unirlos de forma consistente; esto puede aumentar el tiempo de procesamiento y cambiar la resolución de origen. Revisa que haya espacio libre suficiente. No sobrescribe la salida existente salvo que añadas `--overwrite`. Los originales se leen, no se editan. Los archivos temporales se eliminan tras el proceso. La CI incluye una prueba de integración con vídeos sintéticos para verificar la unión de clips con y sin audio.

El JSON es una lista de cortes explícitos: no uses un informe automático sin revisar los tiempos, porque un opening parecido no siempre significa que deba eliminarse.
