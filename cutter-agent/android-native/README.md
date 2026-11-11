# Cutter Studio Android — APK de prueba

Esta carpeta es un envoltorio Android basado en Capacitor. GitHub Actions copia la interfaz de `../android/` a `www/`, genera el proyecto nativo Android y compila una APK de depuración.

## Alcance actual

La APK empaqueta la interfaz de preparación: seleccionar archivos, ordenar episodios, definir texto de marca de agua y exportar/importar manifiestos JSON. Todavía no ejecuta el escáner Python ni FFmpeg, por lo que no detecta openings/endings ni renderiza el video final en el teléfono.

## Seguridad y privacidad

No se configura una API ni un servidor remoto para procesar videos. El proyecto es local y no incluye los archivos de video dentro de la APK. El selector de archivos, exportación/compartición y comportamiento sin conexión deben verificarse en un dispositivo Android real antes de considerar esta APK lista para uso diario.

## Compilación

El flujo de GitHub Actions instala Node.js, JDK y Android SDK, copia la interfaz a `www/`, ejecuta `npm install`, `npx cap add android`, `npx cap sync android` y `gradlew assembleDebug`. La APK resultante se publica como artefacto de la ejecución de Actions; no se sube automáticamente a la página principal ni a Play Store.
