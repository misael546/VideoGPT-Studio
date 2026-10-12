# Revisión visual periódica — VideoGPT Studio

**Fecha de revisión:** 11 de octubre de 2026  
**Alcance:** inspección del generador procedural, los recursos locales y referencias públicas recientes. No se descargaron ni copiaron imágenes, fotogramas, personajes, logotipos ni diseños de terceros.

## Referencias consultadas

- **SHINE — ILLUMINAI Studios (2026):** dirección artística pictórica, escenarios diseñados intencionalmente y luz preparada antes de la animación. https://illuminaistudios.com/shine
- **Shadow Play — Spell Films (2026):** un plano focal claro, cámara contenida y encuadre para que el movimiento cuente la historia. https://spellfilms.com/works/shadow-play
- **Sounds Like Home — The Rookies / Rookie Awards 2026:** desarrollo de look, luz, color y atmósfera para conectar emocionalmente los planos. https://www.therookies.co/entries/52370
- **Licencia de Kenney:** la página oficial de soporte confirma CC0 para los paquetes publicados en sus páginas; revisar cada paquete antes de importarlo. https://kenney.nl/support

## Comparación y decisiones aplicadas

| Área | Estado observado en el generador | Mejora aplicada |
|---|---|---|
| Composición | El formato 1280×720 separa título superior y subtítulo inferior, pero algunas frases largas podían desbordarse. | Subtítulos partidos por palabras y una banda inferior más alta, manteniendo márgenes de seguridad. |
| Iluminación | La base usa gradientes y pulsos de luz; el interior del atardecer necesitaba un haz que conectara ventana y suelo. | Nuevo SVG original de rayos cálidos y motas, compuesto detrás del farol para mantenerlo legible. |
| Detalle | Los fondos procedurales usan formas grandes y pocos elementos finos. | Helechos con nervaduras y hongos luminosos; arco del portal con juntas de piedra, líneas metálicas y runas. |
| Coherencia visual | La paleta mezcla índigo/verde con acentos ámbar, pero había pocos recursos reutilizables. | Los tres recursos nuevos conservan la paleta de la historia y se asignan solo a escenas compatibles. |
| Movimiento | Había partículas, pulsos y parpadeo, mientras el fondo permanecía inmóvil. | Movimiento de cámara suave tipo acercamiento/retroceso con paneo leve, sin depender de servicios externos. |
| Seguridad y continuidad | La galería podía duplicar el MP4 extendido si el enlace anterior incluía una query de caché; las dimensiones de un overlay no estaban acotadas. | Dedupe de galería por ruta normalizada, hash para caché, límites de ruta/tamaño/dimensiones y validador de catálogo. |

## Licencia y límites

Los tres SVG añadidos se dibujaron manualmente para esta biblioteca y no contienen referencias a archivos externos. Se registran como **CC0 1.0 (proyecto)**, con procedencia explícita en recursos/catalogo.json.

Los paquetes externos de Kenney siguen siendo referencias de descarga, no recursos locales instalados. No se descargaron en esta revisión. El generador continúa siendo una animación ilustrada procedural; estos cambios no lo convierten en un modelo generativo de video ni equivalen a una producción 3D o a una película de estudio.


## Verificación de generación — 12 de octubre de 2026

La ejecución gratuita de GitHub Actions terminó correctamente. El MP4 pasó ffprobe: **64,0 s**, **5.443.078 bytes**, vídeo **H.264 1280×720** y audio **AAC**. El servicio gratuito de voz neuronal devolvió HTTP 403 en esa ejecución, así que el generador utilizó **eSpeak NG local** como respaldo; la voz puede sonar más robótica. Se ajustó el registro del generador para que este respaldo se informe de forma breve, sin imprimir trazas repetidas del intento fallido. No se usaron APIs de pago ni se habilitó facturación.
