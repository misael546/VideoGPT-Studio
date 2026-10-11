# Decisión técnica: conexión de ChatGPT con VideoGPT Studio

Fecha: 2026-10-10

## Objetivo
Permitir que una persona suba un video, describa en ChatGPT los cambios que quiere, procese el video sin una segunda IA ni servicios de pago y guarde el resultado en su galería.

## Hallazgo confirmado
La página publicada en GitHub Pages es estática. Su galería actual usa IndexedDB del navegador; los archivos permanecen en el mismo navegador/dispositivo y no se envían a este chat. Este chat no tiene una acción HTTP configurada para llamar a un endpoint privado del proyecto. Un archivo OpenAPI en el repositorio no activa esa conexión por sí solo.

## Por qué no se debe conectar FFHub como solución permanente de $0
FFHub ofrece créditos de prueba, pero su documentación indica que después cobra por tiempo de procesamiento. Los créditos de prueba no constituyen un servicio gratuito ilimitado. No usarlo para el flujo de producción mientras el presupuesto sea estrictamente cero.
Referencias: https://ffhub.io/pricing y https://ffhub.io/docs/quickstart

## Restricciones verificadas de alojamiento
- GitHub Pages sirve archivos estáticos; no ejecuta FFmpeg en el servidor ni acepta una galería privada de videos por sí solo.
- Cloudflare Workers Free tiene límites de CPU y memoria que no lo convierten en un motor adecuado para transcodificar videos largos. Los límites de cuerpo de solicitud también pueden restringir archivos grandes.
  Referencia: https://developers.cloudflare.com/workers/platform/limits/
- No desplegar ni afirmar que existe un backend hasta confirmar que está hospedado, protegido y probado.

## Camino viable sin facturación
1. Mantener la página de subida/galería local como interfaz.
2. Procesar el archivo en el dispositivo del usuario con FFmpeg WebAssembly cuando el navegador y la memoria lo permitan.
3. Intercambiar con ChatGPT un plan JSON limitado y versionado, mediante copiar/pegar mientras no exista una integración autorizada de acciones en la conversación.
4. Validar el plan con una lista de operaciones permitidas. Nunca aceptar código FFmpeg arbitrario ni ejecutar instrucciones del usuario como comandos.
5. Exportar un archivo nuevo, mantener intacto el original y permitir descargarlo y guardarlo en la galería local.
6. Para videos largos o dispositivos con poca memoria, mostrar un error útil y sugerir reducir la resolución/tamaño o usar un ordenador; no prometer que todo tamaño funcionará.

## Bloqueo para la conexión automática solicitada
No hay un mecanismo que permita a este sitio insertar archivos en la conversación actual o hacer que esta conversación llame a un endpoint del sitio automáticamente. Para una conexión directa sería necesario que el usuario configure una integración de ChatGPT compatible con acciones/herramientas, con un backend HTTPS autenticado y una ruta real de subida/descarga; la disponibilidad de esa configuración depende de la cuenta/producto y no se debe asumir. Aun así, el procesamiento debe ejecutarse en un lugar gratuito y accesible, o localmente.

## Criterios de aceptación antes de anunciar la conexión directa
- La web puede transferir el video al procesador con consentimiento explícito.
- ChatGPT puede llamar al endpoint autenticado y entregar un plan de edición.
- La aplicación procesa clips cortos y largos dentro de límites documentados.
- El resultado se valida, se puede reproducir y descargar, y aparece en la galería.
- Las pruebas no requieren claves de proveedores pagados ni activación de facturación.
- Se prueban permisos, expiración de enlaces, límites de tamaño, errores y limpieza de archivos temporales.

**Estado actual: NO hay conexión directa de extremo a extremo.** La documentación del repositorio no debe describirla como implementada.