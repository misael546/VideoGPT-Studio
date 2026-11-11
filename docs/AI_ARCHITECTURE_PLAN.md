# VideoGPT Studio AI — arquitectura inicial sin coste

Estado: plan técnico inicial. No significa que el asistente o la conexión con modelos ya estén implementados.

## Objetivo

Convertir VideoGPT Studio en un asistente que entienda instrucciones en español, proponga un plan de edición seguro, ejecute operaciones reales y verifique el archivo final. El presupuesto de esta etapa es estrictamente $0: no activar facturación ni invocar APIs de pago.

## Decisión de arquitectura

Arquitectura híbrida con tres capas:

1. **Interfaz estática (GitHub Pages):** conversación, selección del archivo local, revisión del plan y estado de exportación. El navegador no enviará videos fuera del dispositivo por defecto.
2. **Capa de interpretación local opcional:** primero un intérprete determinista de intenciones y un esquema JSON versionado. Después, un modelo abierto ejecutado por el usuario en su propio equipo mediante un servidor local como Ollama o llama.cpp. El navegador no debe asumir que ese servidor existe ni exponerlo a Internet. Un modelo en el propio dispositivo puede ser una opción futura si WebGPU y la memoria del dispositivo lo permiten.
3. **Motor local de edición:** FFmpeg WebAssembly para las operaciones compatibles con el navegador. Solo ejecutar operaciones incluidas en una lista permitida; nunca ejecutar comandos arbitrarios generados por el modelo.

GitHub Actions puede ejecutar tareas de desarrollo o generar demostraciones predefinidas, pero no es un backend interactivo gratuito e ilimitado para videos privados de usuarios. GitHub Pages tampoco ejecuta un servidor de IA.

## MVP por fases

### Fase 0 — base y seguridad
- Mantener el sitio funcional sin claves de proveedores ni facturación.
- Documentar capacidades reales y separar el editor local del asistente.
- Añadir pruebas del esquema de plan y del intérprete.
- Preservar el video original en todas las operaciones.

### Fase 1 — asistente útil sin modelo externo
- Aceptar instrucciones en español para acciones explícitamente soportadas: recorte, velocidad permitida, relación de aspecto, volumen y fundidos.
- Convertir la instrucción a un plan JSON con identificador de esquema videogpt-edit-plan/v1.
- Si la petición es ambigua o no está soportada, hacer una pregunta o explicar la limitación; no fingir que se ejecutó.
- Mostrar el plan y exigir que el usuario lo revise antes de exportar.

### Fase 2 — integración de modelo local opcional
- Permitir configurar una URL local explícita para un runtime instalado por el usuario.
- Enviar solo el texto necesario al modelo; el archivo de video permanece local.
- Validar toda respuesta contra el esquema permitido y rechazar propiedades desconocidas, comandos, rutas y código.
- Si el runtime no está instalado o no responde, mantener disponible la Fase 1.

### Fase 3 — edición y verificación
- Ejecutar solo las operaciones compatibles con el navegador.
- Comprobar que la exportación no esté vacía, que el tipo de archivo sea correcto y que el video pueda volver a abrirse.
- Informar con claridad errores, límites de memoria, duración y formatos soportados.
- Nunca sobrescribir el original ni anunciar éxito antes de verificar el resultado.

### Fase 4 — análisis multimedia opcional
- Añadir extracción limitada de fotogramas y transcripción local solo cuando se haya elegido e integrado una herramienta gratuita viable.
- Medir memoria, tiempo y compatibilidad móvil antes de activar funciones pesadas.
- No afirmar que existe comprensión visual o transcripción si no se ha ejecutado realmente.

## Contrato inicial de plan

El editor actual ya usa un plan JSON v1 con los campos `version`, `title`, `trim`, `speed`, `aspect`, `volume` y `fade`. La primera implementación debe reforzar ese contrato existente, no introducir un formato incompatible.

Ejemplo ilustrativo, sujeto a validación contra el video cargado:

~~~json
{
  "version": 1,
  "title": "Reel dinámico",
  "trim": { "start": 2, "end": 18 },
  "speed": 1.25,
  "aspect": "portrait",
  "volume": 80,
  "fade": true
}
~~~

Los únicos valores aceptados deben ser los que el editor ya soporte. Rechazar campos desconocidos, rangos inválidos y valores no finitos antes de cambiar controles. Nunca aceptar comandos, scripts, rutas ni expresiones FFmpeg libres. En una fase posterior se podrá versionar un esquema nuevo mediante migración explícita y pruebas.

## Coste y límites honestos

- GitHub Pages: interfaz estática; no ejecuta modelos ni procesa peticiones de backend.
- Interpretación determinista: sin coste de API, pero menos flexible que un modelo lingüístico.
- Modelo abierto local: sin tarifa por petición, pero requiere instalación, memoria y CPU/GPU del usuario.
- Procesamiento local en navegador: evita subir el archivo, pero puede ser lento o quedarse sin memoria en teléfonos y videos grandes.
- No hay promesa de uso ilimitado en servicios alojados gratuitamente. No añadir proveedores con facturación ni secretos sin cambiar explícitamente el presupuesto.

## Seguridad y privacidad

- No subir videos automáticamente.
- No incluir claves, tokens ni credenciales en el repositorio.
- No aceptar URLs remotas de archivos como entrada implícita.
- Tratar toda salida del modelo como datos no confiables.
- Limitar tamaño, duración, cantidad de operaciones y tiempo de procesamiento.
- Mantener el original y generar una salida independiente.
- Informar claramente si una función necesita un runtime local que no está disponible.

## Pruebas de aceptación del MVP

1. Una instrucción válida produce un plan JSON que cumple el esquema.
2. Una petición ambigua o no compatible no dispara una exportación.
3. Valores negativos, infinitos, campos desconocidos y rangos inválidos se rechazan.
4. El original permanece intacto.
5. Una exportación válida se puede reabrir y verificar; un fallo se muestra como fallo.
6. La aplicación funciona sin claves API y no realiza llamadas a proveedores pagados.
7. La interfaz indica que la selección local no adjunta automáticamente el video a esta conversación.

## Próximo paso de implementación

Revisar el editor actual y sus pruebas; implementar primero el esquema versionado, el validador y el intérprete determinista en una rama separada. Después conectar únicamente las operaciones que el editor ya soporte y probar en móvil y escritorio antes de fusionar o publicar.


## Cutter Studio: PC anfitriona y APK Android como control remoto

Este contrato es obligatorio para Cutter Studio y prevalece sobre cualquier interfaz provisional que permita seleccionar vídeos desde Android:

- **Fuente de verdad:** los episodios originales, análisis, huellas/caché, planes de renderizado, archivos temporales de FFmpeg y el MP4 final residen en la PC Windows.
- **APK Android:** conserva solo datos ligeros del proyecto (orden, nombres/IDs, ajustes, progreso y estado). No debe importar el vídeo original a su almacenamiento, crear copias offline ni descargar el MP4 completo.
- **Vista previa:** la PC prepara y transmite fragmentos MP4 de baja resolución bajo demanda, con rango temporal acotado. El reproductor móvil no debe precargar el episodio entero; usar almacenamiento temporal acotado y no persistente, con limpieza al salir o cambiar de fuente.
- **Control:** Android manda acciones (buscar, reproducir, cambiar orden, revisar/aprobar cortes, iniciar/detener trabajo); el agente local valida cada solicitud y ejecuta el procesamiento en la PC. La PC envía progreso y errores sin enviar el archivo fuente.
- **Resultado:** el montaje final se guarda en la PC y se puede reproducir en Android por streaming. Descargar/guardar una copia local solo se podrá añadir como opción explícita futura, nunca como comportamiento predeterminado.
- **Conexión segura:** para uso en casa, preferir red local autenticada; para uso remoto, una VPN o túnel privado con cifrado y autenticación. No exponer el servidor actual enlazado a `127.0.0.1` directamente a Internet ni abrir un puerto público sin protección. Validar rutas permitidas, identidad de cliente, tamaño de peticiones y permisos de cada operación.
- **Separación de responsabilidades:** GitHub es el centro de código y automatización, no el almacén de episodios ni el servidor de streaming. No subir vídeos privados ni el resultado final a GitHub Actions/Pages.

### Pruebas de aceptación específicas

1. Importar una carpeta en la PC y ver los episodios desde Android sin seleccionar esos vídeos en el teléfono.
2. Confirmar que el almacenamiento usado por la APK no crece proporcionalmente al tamaño/duración del vídeo.
3. Buscar y reproducir varios puntos del episodio sin descargarlo completo.
4. Cerrar/reabrir la APK: el proyecto ligero se recupera y la PC conserva los medios; reconectar no debe duplicar archivos.
5. Ejecutar un montaje y comprobar que el resultado se crea en la PC y se reproduce en Android por streaming.
6. Rechazar clientes no autenticados y rutas fuera de la carpeta autorizada; no abrir el agente a Internet de forma insegura.
7. Si la PC está apagada o desconectada, mostrar el estado «PC no disponible» sin intentar buscar o copiar los vídeos al teléfono.
