# Reglas del proyecto VideoGPT Studio

1. Este proyecto es independiente; no mezclar archivos de DarkPixel Online, Tekaym Online, NeonCore u otros proyectos.
2. No incluir claves API, contraseñas, tokens ni credenciales en el repositorio.
3. No afirmar que un video está terminado hasta validar el resultado y tener un archivo o enlace válido.
4. Mantener la web adaptable a móviles y computadoras.
5. Cada actualización debe revisar rutas, API, configuración, seguridad y documentación.
6. Generar video solo tras una acción explícita y advertir que puede consumir créditos.
7. No enviar archivos del usuario a servicios externos sin una acción clara y explicación.
8. Antes de publicar al público, añadir autenticación, cuotas por usuario, limitación de solicitudes y validación de entradas.
9. No usar almacenamiento en memoria como persistencia de producción.
10. No confiar en enlaces temporales como almacenamiento permanente.
11. Nunca exponer claves API privadas al frontend.
12. Probar inicio del servidor, carga de página, API y manejo de errores antes de publicar.
13. Documentar proveedor, costos, modelos, límites y términos vigentes.
14. Las rutas para asistentes externos requieren `VIDEOGPT_ASSISTANT_TOKEN`; no afirmar que este chat está conectado sin verificarlo.
15. Ante cola llena, no reintentar automáticamente en bucle.
16. El flujo Veo experimental se ejecuta manualmente en GitHub Actions con confirmación explícita de posible consumo de créditos.
17. La clave de Google AI se guarda solo como secreto `GEMINI_API_KEY`; nunca en Git ni en logs.
18. Validar el MP4 final antes de hacer commit; si generación o montaje falla, no publicar archivo incompleto.
19. GitHub es almacenamiento temporal de prueba para MP4 pequeños, no almacenamiento multimedia optimizado para uso público continuo.
20. El presupuesto actual del proyecto es estrictamente $0: no activar facturación ni llamar APIs que puedan generar cargos.
21. Priorizar el workflow `Generate free illustrated video`, que crea ilustraciones, movimiento, subtítulos y narración sin claves ni APIs de pago.
22. El workflow de Veo es opcional y no debe ejecutarse para este usuario mientras no autorice expresamente un cambio de presupuesto.
23. No prometer generación ilimitada ni afirmar que el resultado gratuito tiene calidad equivalente a video generativo avanzado.

24. La página principal debe mantener separadas las secciones Crear con IA y Galería de videos.
25. Los videos se agregan como entradas independientes en `public/videos/gallery.json`; nunca sobrescribir un video anterior sin intención explícita.
26. El generador gratuito debe construir animación con una secuencia de fotogramas, usar voz masculina grave en español si está disponible y añadir efectos sonoros sintetizados sin APIs pagadas.
27. Si la voz neuronal gratuita falla, usar el respaldo local y documentar que la calidad puede ser más robótica; no usar APIs que cobren ni habilitar facturación.


28. La web publicada no debe depender de Vercel; usar GitHub Pages para servir el contenido de `public/`.
29. La generación gratuita corre en GitHub Actions y guarda los MP4 pequeños en el repositorio; no afirmar que la página convierte prompts arbitrarios en videos personalizados hasta implementarlo y validarlo.
30. Mantener la página funcional sin claves de proveedores ni APIs que puedan cobrar; presupuesto $0.

31. Mantener una biblioteca reutilizable en `recursos/`, con imágenes, sonidos, música, plantillas y un catálogo JSON; mantenerla separada de los videos terminados.
32. El generador gratuito debe leer `recursos/catalogo.json` de forma tolerante a errores. Las entradas visuales de tipo `image_overlay` pueden componerse solo si la ruta existe dentro del repositorio y coincide con la escena; los recursos ausentes se omiten sin romper la generación.
33. La biblioteca no equivale a entrenar un modelo. No prometer entrenamiento automático ni compatibilidad de audio/fondos hasta implementar y probar esas funciones.
34. Añadir únicamente recursos propios o con licencia compatible; optimizar archivos y no incluir videos finales en `recursos/`.

35. La biblioteca de recursos debe revisarse semanalmente: buscar mejoras visuales, detectar duplicados/rutas rotas, validar procedencia y licencia, y añadir recursos originales solo cuando aporten valor.
36. La revisión periódica puede comparar referencias públicas de composición, iluminación, detalle y movimiento, pero no debe copiar material protegido ni asumir que una imagen encontrada en internet es reutilizable sin verificar su licencia.
37. La automatización semanal debe respetar el presupuesto $0, no habilitar servicios pagados y no afirmar que se generó arte con IA si la herramienta no estuvo disponible.


38. El editor de video del sitio debe procesar archivos locales en el navegador cuando sea posible; no subir el material del usuario a servidores sin una acción clara y explicación.
39. El editor gratuito no debe usar APIs de pago ni exponer credenciales. Las librerías públicas necesarias deben fijarse a versiones concretas y su descarga debe documentarse.
40. No prometer que ChatGPT está conectado al editor ni que entiende cualquier instrucción automáticamente; describir con precisión las operaciones realmente implementadas.
41. Validar el archivo exportado y comprobar errores de carga, recorte inválido, límites de memoria y compatibilidad móvil. Nunca reemplazar el video original automáticamente.


42. La página de VideoGPT Studio no debe presentarse como si contuviera una IA propia conectada a este chat.
43. Para solicitar una edición asistida por ChatGPT, indicar que el usuario debe adjuntar el video directamente en su conversación de ChatGPT; un sitio estático de GitHub Pages no puede entregar automáticamente archivos a la conversación actual.
44. No inventar una conexión entre la web y ChatGPT ni afirmar que se recibió un archivo subido a la web. El editor local puede mantenerse como alternativa manual opcional.


45. El editor debe admitir planes de edición JSON versionados preparados externamente por ChatGPT y validarlos antes de modificar controles o exportar.
46. El plan JSON v1 solo puede ejecutar operaciones implementadas y validadas por el editor: trim en segundos, speed en opciones admitidas, aspect, volume y fade. No ejecutar código arbitrario ni expresiones FFmpeg proporcionadas por usuarios.
47. Explicar que el puente actual es mediante copiar/pegar el plan entre ChatGPT y el editor; no afirmar conexión directa de la web con esta conversación.

48. El extractor de cuadros debe funcionar localmente en el navegador, limitar la cantidad de capturas, permitir descargar cuadros y hoja de escenas, y restaurar la posición de reproducción al terminar.

49. El editor de VideoGPT Studio puede mezclar localmente hasta tres pistas: narración, música de fondo en bucle y efectos de sonido. El asistente puede preparar pistas cuando el usuario las solicite.
50. La voz masculina en español se sintetiza localmente con Kokoro si el modelo se descarga y funciona en el navegador. La música instrumental y los efectos de transición se sintetizan localmente; no usar APIs de pago ni subir el video del usuario. Si falla la generación de voz, informar del fallo y no afirmar que la pista quedó lista.
51. Al exportar, mezclar las pistas solicitadas y el audio original cuando exista; bajar el volumen original para priorizar la voz y mantener la música de fondo discreta. Validar el MP4 final y recordar que el rendimiento depende del navegador, FFmpeg WebAssembly y la memoria del dispositivo.

52. El flujo guiado debe preguntar qué resultado quiere el usuario después de cargar un video y antes de mostrar la zona de edición.
53. Los presets guiados solo pueden aplicar operaciones existentes y probadas localmente; no afirmar que generan automáticamente guion, narración, escenas nuevas o análisis semántico.
54. Después de preparar el preset, mostrar el plan y permitir revisarlo antes de exportar. El archivo original no debe sobrescribirse y el procesamiento sigue siendo local sin servicios de pago.
55. En GitHub Pages, el worker de @ffmpeg/ffmpeg debe servirse desde el mismo origen del sitio; no crear Worker directamente desde jsDelivr.
56. El workflow de publicación debe descargar versiones fijadas de worker.js y sus dependencias, comprobar que existen y validar sintaxis antes de publicar. El motor core/WASM puede descargarse de la CDN fijada, sin subir videos del usuario.

57. La página pública del editor debe mostrar únicamente la selección/carga del video y una vista previa opcional; no mostrar controles de edición, mezclador, extracción de escenas ni exportación hasta que el usuario indique qué desea hacer. Aclarar que seleccionar el archivo en GitHub Pages no lo adjunta automáticamente a este chat.
58. La página Subir video debe ser mínima: selector/arrastrar archivo, vista previa opcional y botón para guardarlo en la biblioteca local del navegador. Los videos locales se muestran en la galería del mismo navegador/dispositivo; nunca afirmar que eso los sube a un servidor o los adjunta automáticamente a ChatGPT. La edición asistida requiere adjuntar el archivo directamente a la conversación mientras no exista un backend seguro de carga y transferencia.


59. La prioridad vigente es una experiencia dirigida por ChatGPT, no integrar otra IA como asistente visible. No llamar a proveedores de IA externos que puedan cobrar; el presupuesto continúa en $0.
60. La interfaz pública debe seguir siendo mínima: seleccionar un video, vista previa opcional y galería local. No volver a mostrar controles, mezclador o línea de tiempo como paso obligatorio del usuario.
61. No afirmar que ChatGPT puede leer automáticamente un video guardado en IndexedDB ni que el sitio está conectado a esta conversación. La galería local solo pertenece al mismo navegador/dispositivo.
62. La conexión directa solo puede anunciarse después de implementar y verificar una integración autenticada de extremo a extremo: transferencia segura del original, recepción de instrucciones preparadas por ChatGPT, procesamiento gratuito, validación del resultado y descarga/galería.
63. Antes de seleccionar una arquitectura de backend, verificar que el alojamiento elegido permita procesar y almacenar videos dentro del presupuesto $0. GitHub Pages es estático y no procesa archivos subidos por usuarios; no dar por hecho que un endpoint Express está desplegado.
64. No reutilizar los endpoints heredados de Agnes ni el archivo OpenAPI de generación pagada como si fueran el flujo de edición solicitado. No enviar videos del usuario a esos endpoints.
65. La edición automática solo puede usar operaciones implementadas, seguras y probadas. Si una petición requiere capacidades que no están disponibles sin pago, explicar la limitación y no fingir que el archivo se modificó.
66. Mantener el original intacto, validar el archivo de salida y comprobar el flujo en móvil y escritorio antes de declarar una función terminada.


67. Cutter Studio opera sobre archivos locales del usuario. Nunca subir episodios, audio, subtítulos ni vídeos terminados a GitHub, GitHub Pages, Vercel ni servicios externos como parte del flujo local.
68. Las coincidencias de opening/ending son candidatas: ningún corte se aprueba automáticamente. Solo eliminar intervalos con aprobación explícita en el plan revisado; conservar los intervalos pendientes o rechazados y mantener intactos los originales.
69. El servidor de revisión debe escuchar exclusivamente en `127.0.0.1`, validar que las rutas estén dentro de la carpeta elegida y no exponer endpoints de archivos o vistas previas a la red.
70. Los paquetes de Cutter Studio pueden incluir únicamente código, documentación y recursos de prueba sintéticos; nunca incluir vídeos del usuario, cachés con rutas privadas ni planes de sus proyectos.
71. Mantener Cutter Studio en su rama/PR de desarrollo mientras se valida. No fusionar a `main`, publicar la web ni crear una versión pública como parte del desarrollo sin una autorización explícita.
72. Un artefacto descargable de Windows solo se publica desde una ejecución de CI que haya completado correctamente las pruebas; el paquete debe incluir el SHA de origen y no debe afirmar que se probó con episodios reales si no se han proporcionado.
