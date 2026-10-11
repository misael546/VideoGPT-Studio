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
