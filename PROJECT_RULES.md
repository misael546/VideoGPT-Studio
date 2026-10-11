# Reglas del proyecto VideoGPT Studio

1. Este proyecto es independiente; no reutilizar ni mezclar archivos de DarkPixel Online, Tekaym Online, NeonCore u otros proyectos.
2. No incluir claves API, contraseñas, tokens ni credenciales en el repositorio.
3. No mostrar al usuario que un video está terminado hasta que el proveedor confirme el resultado y exista un enlace válido.
4. Mantener la web adaptable a móviles y computadoras.
5. Cada actualización debe revisar rutas, API, configuración, errores de consola, seguridad y documentación.
6. Generar video solo tras una acción explícita del usuario y advertir que la operación puede consumir créditos.
7. No enviar archivos del usuario a servicios externos sin una acción clara y una explicación de qué servicio los procesa.
8. Antes de publicar al público, añadir autenticación, cuotas por usuario, limitación de solicitudes, validación de entradas y controles de tamaño/tipo de archivo.
9. No usar almacenamiento en memoria como persistencia de producción.
10. No confiar en enlaces de salida temporales como almacenamiento permanente; ofrecer descarga o almacenamiento persistente antes de que caduquen.
11. Nunca exponer las claves de OpenAI o Runway al frontend.
12. Antes de publicar, probar que el servidor inicia, la página carga, la API responde y los errores se muestran claramente.
13. La generación de video debe usar un proveedor autorizado; documentar costos, modelos, límites y términos vigentes.

14. Las rutas para asistentes externos deben requerir un token de servidor en `VIDEOGPT_ASSISTANT_TOKEN`; nunca exponerlo en frontend ni en Git. No afirmar que la integración está conectada a este chat hasta verificarla en el entorno real.
15. Las rutas de asistente solo pueden informar que el video terminó cuando el proveedor confirme éxito y devuelva una URL HTTP(S) válida. Ante cola llena, no reintentar automáticamente en bucle.
