# Fuentes externas gratuitas para la biblioteca

Esta lista es una selección inicial de paquetes que declaran licencia CC0 en sus páginas oficiales. **Catalogado no significa descargado ni integrado al generador**: los paquetes de abajo están registrados para importación y revisión. Los archivos solo pasarán a la biblioteca local después de descargar, inspeccionar, optimizar y comprobar sus licencias.

## Paquetes revisados

| Paquete | Uso previsto | Licencia indicada | Fuente |
|---|---|---|---|
| Retro Textures Fantasy — Kenney | Texturas de escenarios retro/fantasía | CC0 | https://kenney.nl/assets/retro-textures-fantasy |
| Foliage Pack — Kenney | Vegetación 2D | CC0 | https://kenney.nl/assets/foliage-pack |
| Generic Items — Kenney | Objetos y utilería 2D | CC0 | https://kenney.nl/assets/generic-items |
| Impact Sounds — Kenney | Golpes e impactos | CC0 | https://kenney.nl/assets/impact-sounds |
| Interface Sounds — Kenney | Sonidos de interfaz | CC0 | https://kenney.nl/assets/interface-sounds |
| UI Audio — Kenney | Clics y sonidos de botones | CC0 | https://kenney.nl/assets/ui-audio |
| 1-Bit Pack — Kenney | Sprites de personajes, objetos y tiles con estética monocromática | CC0 | https://kenney-assets.itch.io/1-bit-pack |
| Block Pack — Kenney | Tiles, terreno, edificios, objetos y personajes para RPG | CC0 | https://kenney-assets.itch.io/block-pack |
| Retro Medieval Kit — Kenney | Modelos 3D de estilo medieval retro; no compatible directamente con el generador 2D actual | CC0 | https://kenney-assets.itch.io/retro-medieval-kit |

## Pendiente de revisión directa

- Music Jingles — https://kenney.nl/assets/music-jingles. Confirmar los detalles de licencia y el contenido antes de importarlo.

## Reglas de importación

1. Descargar desde la página del autor, sin extraer contenido de fuentes dudosas.
2. Confirmar licencia en la página del paquete y conservar la procedencia.
3. Importar solo archivos útiles para una escena; no copiar paquetes enteros innecesariamente.
4. Optimizar imágenes y audio; comprobar formatos compatibles con el generador.
5. Mantener cada recurso local registrado en `recursos/catalogo.json` con ruta real.
6. No registrar un archivo como local ni utilizable por el generador hasta que exista en el repositorio y haya sido probado.
7. Los paquetes `external_pack` no se procesan como `image_overlay` por el generador actual.


## Recursos originales ya guardados localmente

Se añadieron siete ilustraciones SVG originales dentro del repositorio y quedaron registradas como `image_overlay` en el catálogo:

- `recursos/imagenes/objetos/farol-antiguo.svg` — escena `old`.
- `recursos/imagenes/personajes/viajero.svg` — escena `village`.
- `recursos/imagenes/escenarios/runas-antiguas.svg` — escena `forest`.
- `recursos/imagenes/objetos/chispas-magicas.svg` — escenas `soul`, `baby` y `portal`.
- `recursos/imagenes/escenarios/rayos-ventana.svg` — rayos cálidos y motas de polvo para `old`.
- `recursos/imagenes/escenarios/helechos-luminosos.svg` — vegetación bioluminiscente de primer plano para `forest`.
- `recursos/imagenes/objetos/marco-portal-antiguo.svg` — arco de piedra y runas para `portal`.

El generador convierte estos SVG a PNG en tiempo de ejecución con CairoSVG; el workflow instala esa dependencia. Son recursos vectoriales originales del proyecto, no descargas de Kenney. La compatibilidad real se considera confirmada únicamente cuando el workflow termina correctamente.

## Estado de importación

Los paquetes anteriores están catalogados como fuentes, pero todavía no se han descargado ni incorporado como archivos locales. El intento de descarga directa de Retro Textures Fantasy falló en el entorno de trabajo por un error de resolución de red. No deben tratarse como activos listos para usar hasta importarlos y probarlos. La biblioteca también incluye una referencia musical marcada como pendiente de verificación.

La guía de Wikimedia/Creative Commons recuerda que los archivos tienen condiciones individuales y que, cuando la licencia lo exige, deben conservarse autor, fuente y licencia: https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en y https://creativecommons.org/reusing-cc-licensed-content/.

## Revisión visual de referencia

La revisión de composición, iluminación, detalle, coherencia y movimiento se documenta en [REVISION_VISUAL.md](REVISION_VISUAL.md). Las referencias públicas se usaron únicamente para extraer principios generales; no se descargaron ni copiaron imágenes, personajes, fotogramas ni diseños protegidos.
