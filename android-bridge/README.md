# Puente local de VideoGPT Studio para Android (Termux)

Este módulo es una **base local experimental** para procesar videos con FFmpeg instalado en el teléfono. No usa un proveedor de IA ni sube archivos a la nube.

> **Límite importante:** este puente todavía NO está conectado a la conversación de ChatGPT. Las cuentas ChatGPT Free no pueden conectar un servidor MCP personalizado con acciones de escritura desde la app móvil. El servidor aquí expone una API local autenticada para preparar el motor Android y permitir pruebas locales; no debe anunciarse como conexión directa.

## Requisitos

- Android con Termux.
- Node.js y FFmpeg instalados en Termux.
- Permiso de Termux para acceder al almacenamiento compartido.
- Un video en `~/storage/shared/` (por ejemplo, `~/storage/shared/Movies/clip.mp4`).

## Instalar y ejecutar

En Termux:

```sh
pkg update
pkg install nodejs-lts ffmpeg git
termux-setup-storage
mkdir -p ~/VideoGPTStudio
```

Clona el repositorio si aún no existe en Termux:

```sh
cd ~
git clone https://github.com/misael546/VideoGPT-Studio.git
cd ~/VideoGPT-Studio
git switch feat/android-local-bridge
cd android-bridge
node server.mjs
```

Si ya clonaste el repositorio, entra a la carpeta del proyecto y ejecuta `git fetch origin && git switch feat/android-local-bridge && git pull` antes de iniciar el servidor.

Al iniciar, el servidor imprime un token de sesión. **No lo publiques ni lo envíes a nadie.** El token cambia al reiniciar el proceso, salvo que configures `VIDEOGPT_BRIDGE_TOKEN` tú mismo.

El servicio escucha únicamente en `127.0.0.1:43821`; no lo expongas a la red ni uses un túnel público.

## Comprobar que funciona

En otra sesión de Termux:

```sh
curl http://127.0.0.1:43821/health
```

Debe responder JSON con `"ok":true`. Este control no procesa videos.

## Solicitar una edición local

Reemplaza las rutas con archivos reales de tu teléfono y usa el token que imprimió el servidor:

```sh
curl -X POST http://127.0.0.1:43821/api/edit \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer PEGA_AQUI_EL_TOKEN_LOCAL' \
  --data '{
    "input": "/data/data/com.termux/files/home/storage/shared/Movies/clip.mp4",
    "output": "/data/data/com.termux/files/home/storage/shared/Movies/clip-editado.mp4",
    "trimStart": 0,
    "trimEnd": 12,
    "speed": 1,
    "aspect": "original",
    "volume": 1,
    "fade": false
  }'
```

Las opciones permitidas son:
- `trimStart` y `trimEnd`: segundos; `trimEnd: 0` significa hasta el final.
- `speed`: 0.5, 0.75, 1, 1.25, 1.5 o 2.
- `aspect`: `original`, `landscape`, `portrait` o `square`.
- `volume`: de 0 a 2.
- `fade`: `true` o `false`.

Las rutas de entrada y salida deben estar en `~/storage/shared/` o `~/VideoGPTStudio/`. La salida tiene que ser un MP4 nuevo: el servidor rechaza rutas fuera de esas carpetas y nombres de salida que ya existan. El original no se modifica. Revisa el resultado reproduciéndolo antes de darlo por bueno.

## Seguridad y estado

- No hay endpoint público ni conexión a ChatGPT.
- No se ejecutan comandos arbitrarios recibidos en JSON; los filtros se construyen con opciones permitidas.
- El servidor usa `spawn` sin shell y limita el tamaño de la petición.
- El token de sesión se imprime en la terminal; protege esa terminal y no compartas el token.
- No se deben agregar claves API, secretos o tokens al repositorio.
- La validación actual es básica (código de salida, existencia y tamaño del archivo). Todavía falta una batería de pruebas en dispositivos Android reales.
