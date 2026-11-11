@echo off
setlocal EnableExtensions
title Cutter Studio - requisitos de Windows
cd /d "%~dp0"

:menu
cls
echo ==========================================
echo   CUTTER STUDIO - REQUISITOS DE WINDOWS
echo ==========================================
echo.
echo Cutter Studio necesita Python 3.10+ y FFmpeg con FFprobe.
echo Los instaladores son gratuitos; se ejecutan solo si los eliges.
echo.
call :check_python
if errorlevel 1 (
  echo Python: FALTA
) else (
  echo Python: OK
)
call :check_ffmpeg
if errorlevel 1 (
  echo FFmpeg/FFprobe: FALTA
) else (
  echo FFmpeg/FFprobe: OK
)
echo.
echo 1. Instalar requisitos faltantes con winget
echo 2. Volver a comprobar
echo 3. Abrir descargas manuales oficiales
echo 4. Salir
echo.
set "CHOICE="
set /p "CHOICE=Selecciona una opcion: "
if "%CHOICE%"=="1" goto install
if "%CHOICE%"=="2" goto menu
if "%CHOICE%"=="3" goto manual
if "%CHOICE%"=="4" exit /b 0
goto menu

:check_python
python --version >nul 2>nul
if errorlevel 1 exit /b 1
for /f "tokens=2" %%V in ('python --version 2^>^&1') do (
  for /f "tokens=1,2 delims=." %%A in ("%%V") do (
    if %%A LSS 3 exit /b 1
    if %%A EQU 3 if %%B LSS 10 exit /b 1
  )
)
exit /b 0

:check_ffmpeg
ffmpeg -version >nul 2>nul
if errorlevel 1 exit /b 1
ffprobe -version >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0

:install
where winget >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encuentra winget. Abriendo las descargas manuales.
  goto manual
)
echo.
echo Se solicitaran las aprobaciones de los instaladores antes de instalarlos.
echo Escribe S para continuar o cualquier otra tecla para cancelar.
set "CONFIRM="
set /p "CONFIRM=Continuar con la instalacion? [S/N]: "
if /I not "%CONFIRM%"=="S" goto menu

call :check_python
if errorlevel 1 (
  echo.
  echo Instalando Python 3.12 para el usuario actual...
  winget install --exact --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo No se pudo instalar Python mediante winget.
    echo Abre la pagina oficial del menu manual.
    pause
    goto manual
  )
)

call :check_ffmpeg
if errorlevel 1 (
  echo.
  echo Instalando FFmpeg...
  winget install --exact --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo No se pudo instalar FFmpeg mediante winget.
    echo Abre la pagina de compilaciones de FFmpeg del menu manual.
    pause
    goto manual
  )
)

echo.
echo Instalacion terminada. Windows puede no actualizar el PATH de esta ventana.
echo Cierra Cutter Studio y vuelve a abrirlo; despues entra a esta opcion para verificar.
pause
goto menu

:manual
echo.
echo Descargas manuales:
echo Python para Windows: https://www.python.org/downloads/windows/
echo FFmpeg para Windows: https://www.gyan.dev/ffmpeg/builds/
echo.
echo Python debe estar en PATH y FFmpeg debe incluir ffmpeg.exe y ffprobe.exe en PATH.
start "" "https://www.python.org/downloads/windows/"
start "" "https://www.gyan.dev/ffmpeg/builds/"
pause
goto menu
