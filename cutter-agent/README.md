# Cutter Studio — agente local

Este componente se ejecuta en el PC del usuario. Los vídeos y los archivos de trabajo permanecen en carpetas locales; no se suben a GitHub ni a servicios externos.

## Inicio rápido en Windows

Abre `INICIAR_CUTTER_STUDIO.bat`. El menú permite analizar episodios, revisar cortes en una interfaz local del navegador y renderizar el plan aprobado. El lanzador usa cuadros de diálogo de Windows para elegir la carpeta de episodios, el plan revisado, la carpeta y nombre de salida, y opcionalmente la imagen de marca de agua; si cancelas la selección inicial de carpeta o de plan, también admite escribir la ruta manualmente. Los resultados se guardan localmente, en una carpeta `Cutter-Studio-Output` junto al plan por defecto. En el menú, la opción 3 abre `PREPARAR_REQUISITOS_WINDOWS.bat`, que comprueba Python y FFmpeg/FFprobe y ofrece instalarlos con winget (o abrir las páginas oficiales). Si instalas requisitos, cierra y vuelve a abrir Cutter Studio para actualizar PATH. Los informes, la caché y el vídeo final se guardan localmente.

El lanzador abre `review_server.py`, que enlaza solo a `127.0.0.1` en un puerto local. La interfaz `review.html` carga el plan automáticamente; FFmpeg convierte las vistas previas a MP4 para admitir MKV y otros formatos, y el navegador las reproduce por bloques de bytes para facilitar la búsqueda sin descargar cada clip completo a memoria JavaScript. Ajusta los límites y elige «Aprobar eliminación», «Conservar» o «Pendiente de revisión». Al terminar, pulsa «Guardar y finalizar revisión»: Cutter Studio guarda `edit-plan-reviewed.json`, cierra el servidor local y elimina las vistas previas temporales. Si el botón no responde, Ctrl+C en la ventana del servidor sigue siendo una alternativa. Los vídeos no se suben a Internet.

Para iniciar el revisor manualmente desde una terminal:

```bash
python review_server.py --folder "D:\\Anime\\Temporada 1" --plan "D:\\Anime\\Temporada 1\\edit-plan.json"
```

El servidor elige un puerto disponible automáticamente y abre el navegador. Solo escucha en `127.0.0.1`; no lo publiques ni lo expongas a la red.



El lanzador utiliza `seleccionar-ruta.ps1` para mostrar diálogos nativos de Windows. El script solo devuelve la ruta elegida al proceso local; no envía archivos ni rutas a GitHub o a servicios externos. La salida existente nunca se reemplaza sin confirmación explícita y el renderizador valida el resultado antes de colocar el MP4 final.

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

El escáner obtiene duración, resolución y tamaño, ordena por temporada y número de episodio cuando puede inferirlos del nombre (por ejemplo `S01E02` o `2x11`) e ignora etiquetas habituales de resolución, códec y audio como `1080p`, `x265`, `DDP5.1` y `AAC2.0`; inspecciona los primeros y últimos 180 segundos. Si analizas recursivamente una carpeta de temporada, omite `Cutter-Studio-Output` para no volver a incluir resultados anteriores como episodios. La huella visual combina luminosidad media (aHash) y gradientes horizontales (dHash). Cuando existe una pista de audio, FFmpeg extrae características locales de cuatro bandas de frecuencia; estas ayudan a encontrar música repetida aunque cambien las imágenes. Ambas modalidades comparan secuencias con hasta 15 segundos de desfase y admiten como máximo dos muestras discordantes por tramo candidato. Un filtro inicial de muestras espaciadas descarta alineaciones claramente distintas antes de la comparación completa. El informe registra calidad de coincidencia por modalidad. Cuando visual y audio apuntan a un tramo cercano, sus evidencias se combinan en un candidato. Si falla la extracción de una modalidad, se registra una advertencia y se conserva la otra para que el análisis no descarte un episodio solo por no poder extraer sus fotogramas o su audio. Los límites cercanos al principio/final se pueden ampliar hasta el borde si quedan a 10 segundos o menos, pero siempre se marcan para revisión.

### 2. Crear el plan de edición revisable

```bash
python edit_plan.py create scan-report.json --output edit-plan.json
```

El plan incluye el orden propuesto y las coincidencias visuales y/o de audio como candidatos. Agrupa intervalos superpuestos descubiertos en varias comparaciones entre episodios y conserva las modalidades y pares que aportaron evidencia, evitando mostrar repetidamente el mismo corte. Cada corte comienza con `"approved": false`; por tanto, **no se elimina nada por defecto**. Abre `review.html`, carga el plan y la carpeta de episodios, reproduce cada candidato, ajusta los tiempos y marca «Aprobar eliminación» solo cuando lo hayas confirmado. Si un nombre de archivo no es único, el generador no asigna candidatos ambiguos a una ruta.

**Orden manual de unión:** cada tarjeta de episodio incluye el selector «Orden de salida». Cambia la posición final de cada episodio, incluso si el archivo no incluye número o la numeración se detectó mal. Al mover uno, los demás se desplazan y se renumeran automáticamente; las decisiones de cortes permanecen asociadas al episodio correcto. El orden que ves en el plan revisado es el que usará el montaje final. Exporta/guarda el plan revisado para conservar el orden. El revisor local identifica las previsualizaciones por la ruta del episodio validada, no solo por su índice, para no reproducir otro capítulo si cambiaste el orden y todavía no has guardado el plan.

Los tiempos sugeridos corresponden únicamente al tramo que el escáner logró emparejar. No se asume que ese tramo cubra el opening o ending completo; revisa y ajusta `start_seconds` y `end_seconds` según corresponda. Los intervalos aprobados se eliminarán del episodio; los no aprobados se conservarán.

### 3. Generar un manifiesto de renderizado

Después de exportar `edit-plan-reviewed.json` desde la interfaz de revisión:

```bash
python edit_plan.py render-manifest edit-plan-reviewed.json --output render-manifest.json
```

El generador convierte los cortes aprobados en los segmentos que deben conservarse. Combina cortes aprobados que se solapan y se detiene si un episodio quedaría completamente vacío. El orden de la lista final sigue el orden del plan.

### 4. Renderizar el vídeo unido

```bash
python render.py render-manifest.json --output "D:\\Anime\\Temporada 1\\temporada-final.mp4" --watermark "D:\\Anime\\marca.png"
```

La marca de agua es opcional. El renderizador normaliza segmentos a MP4 H.264/AAC, 1920×1080, 30 fps y audio estéreo de 48 kHz. Antes de publicar el archivo de salida en la ruta elegida, comprueba que contenga vídeo, que no esté vacío y que su duración corresponda a los segmentos esperados. Esto puede aumentar el tiempo de procesamiento y cambiar la resolución original; reserva espacio libre suficiente. No sobrescribe una salida existente salvo que se indique `--overwrite`. Los originales se leen, no se editan, y el archivo final solo se coloca en su destino cuando la operación completa termina correctamente.

## Límites y seguridad

- Las coincidencias visuales o de audio son candidatas, no una garantía de que el tramo sea un opening o ending. Nunca se aprueban cortes automáticamente; la música puede aparecer como fondo en otra escena.
- El escáner muestrea una vez por segundo. La huella de audio resume la energía relativa en cuatro bandas de frecuencia; no es reconocimiento musical semántico y puede fallar con remezclas, cortes temporales o cambios de velocidad.
- La caché usa un esquema versionado para invalidar huellas de versiones anteriores automáticamente. Si una extracción de audio falla, se registra en `audio_warnings` y aún pueden usarse las coincidencias visuales.
- El revisor escucha solo en `127.0.0.1`, limita las vistas previas a vídeos dentro de la carpeta seleccionada y guarda el plan junto al original sin reemplazarlo. Las vistas previas temporales se eliminan al cerrar el servidor. No expongas el servidor a la red.
- La CI instala FFmpeg y prueba la unión de clips sintéticos, la detección multimodal y las funciones del servidor local.
