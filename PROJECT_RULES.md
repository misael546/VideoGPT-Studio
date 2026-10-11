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
