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
