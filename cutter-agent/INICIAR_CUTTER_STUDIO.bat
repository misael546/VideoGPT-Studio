@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Cutter Studio - procesamiento local

:menu
cls
echo ========================================
echo           CUTTER STUDIO
echo   Los videos permanecen en tu PC
echo ========================================
echo.
echo 1. Analizar episodios y revisar cortes
echo 2. Renderizar un plan ya revisado
echo 3. Preparar/verificar requisitos de Windows
echo 4. Salir
echo.
set "CHOICE="
set /p "CHOICE=Selecciona una opcion: "

if "%CHOICE%"=="1" goto scan
if "%CHOICE%"=="2" goto render
if "%CHOICE%"=="3" goto requirements
if "%CHOICE%"=="4" exit /b 0
goto menu

:requirements
call "%~dp0PREPARAR_REQUISITOS_WINDOWS.bat"
goto menu

:check
where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: No encuentro Python en PATH.
  echo Instala Python 3.10 o superior y vuelve a intentarlo.
  pause
  exit /b 1
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo ERROR: No encuentro FFmpeg en PATH.
  echo Instala FFmpeg y asegurate de que ffmpeg y ffprobe esten en PATH.
  pause
  exit /b 1
)
where ffprobe >nul 2>nul
if errorlevel 1 (
  echo ERROR: No encuentro ffprobe en PATH.
  pause
  exit /b 1
)
exit /b 0

:scan
call :check
if errorlevel 1 goto menu
echo.
echo Selecciona la carpeta que contiene los episodios.
set "VIDEO_FOLDER="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0seleccionar-ruta.ps1" -Mode Folder`) do set "VIDEO_FOLDER=%%I"
if not defined VIDEO_FOLDER (
  echo No se selecciono una carpeta. Puedes escribir su ruta manualmente.
  set /p "VIDEO_FOLDER=Ruta de la carpeta (sin comillas): "
)
if not exist "%VIDEO_FOLDER%\" (
  echo ERROR: La carpeta no existe.
  pause
  goto menu
)
echo.
echo Analizando videos en "%VIDEO_FOLDER%"...
python "%~dp0cutter.py" scan "%VIDEO_FOLDER%" --recursive --output "%VIDEO_FOLDER%\cutter-scan-report.json"
if errorlevel 1 (
  echo El analisis fallo. No se creo ningun video final.
  pause
  goto menu
)
python "%~dp0edit_plan.py" create "%VIDEO_FOLDER%\cutter-scan-report.json" --output "%VIDEO_FOLDER%\edit-plan.json"
if errorlevel 1 (
  echo No se pudo crear el plan de edicion.
  pause
  goto menu
)
echo.
echo Se abrira el revisor local en el navegador.
echo Los candidatos se revisan antes de eliminar cualquier tramo.
echo Los videos permanecen en tu PC; el servidor escucha solo en 127.0.0.1.
echo Cuando termines, pulsa Guardar y finalizar revision en el navegador.
echo Si el boton falla, Ctrl+C en la ventana del servidor sirve como alternativa.
start "Cutter Studio Revisor" /min python "%~dp0review_server.py" --folder "%VIDEO_FOLDER%" --plan "%VIDEO_FOLDER%\edit-plan.json"
pause
goto menu

:render
call :check
if errorlevel 1 goto menu
echo.
echo Selecciona el archivo edit-plan-reviewed.json que exportaste del revisor.
set "PLAN="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0seleccionar-ruta.ps1" -Mode Plan`) do set "PLAN=%%I"
if not defined PLAN (
  echo No se selecciono un plan. Puedes escribir su ruta manualmente.
  set /p "PLAN=Ruta completa a edit-plan-reviewed.json (sin comillas): "
)
if not exist "%PLAN%" (
  echo ERROR: No encuentro ese archivo.
  pause
  goto menu
)
for %%I in ("%PLAN%") do set "PLAN_DIR=%%~dpI"
set "OUTPUT_FOLDER=%PLAN_DIR%Cutter-Studio-Output"
set "CHANGE_OUTPUT="
echo.
echo Carpeta de salida predeterminada: "%OUTPUT_FOLDER%"
set /p "CHANGE_OUTPUT=Quieres elegir otra carpeta de salida? [s/N]: "
if /I "%CHANGE_OUTPUT%"=="S" goto choose_output_folder
goto configure_output

:choose_output_folder
set "PICKED_FOLDER="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0seleccionar-ruta.ps1" -Mode OutputFolder -InitialDirectory "%PLAN_DIR%"`) do set "PICKED_FOLDER=%%I"
if defined PICKED_FOLDER set "OUTPUT_FOLDER=%PICKED_FOLDER%"

:configure_output
if not exist "%OUTPUT_FOLDER%\" mkdir "%OUTPUT_FOLDER%"
if not exist "%OUTPUT_FOLDER%\" (
  echo ERROR: No se pudo crear la carpeta de salida.
  pause
  goto menu
)
set "OUTPUT_VIDEO="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0seleccionar-ruta.ps1" -Mode OutputVideo -InitialDirectory "%OUTPUT_FOLDER%"`) do set "OUTPUT_VIDEO=%%I"
if defined OUTPUT_VIDEO goto output_chosen
echo.
echo No seleccionaste un nombre para el archivo final.
set "USE_DEFAULT="
set /p "USE_DEFAULT=Usar la ruta predeterminada en %OUTPUT_FOLDER% (temporada-final.mp4)? [S/n]: "
if /I "%USE_DEFAULT%"=="N" goto configure_output
set "OUTPUT_VIDEO=%OUTPUT_FOLDER%\temporada-final.mp4"

:output_chosen
if not exist "%OUTPUT_VIDEO%" goto output_is_clear
echo.
echo El archivo ya existe: "%OUTPUT_VIDEO%"
set "CONFIRM_OVERWRITE="
set /p "CONFIRM_OVERWRITE=Escribe S para reemplazarlo solo si el nuevo render termina y pasa la validacion [N]: "
if /I "%CONFIRM_OVERWRITE%"=="S" goto allow_overwrite
goto configure_output

:output_is_clear
set "RENDER_OVERWRITE="
goto choose_watermark

:allow_overwrite
set "RENDER_OVERWRITE=--overwrite"

:choose_watermark
set "WATERMARK="
echo.
echo Selecciona una imagen PNG/JPG/WebP para la marca de agua.
echo Si no quieres marca de agua, cancela el cuadro de dialogo.
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0seleccionar-ruta.ps1" -Mode Watermark -InitialDirectory "%PLAN_DIR%"`) do set "WATERMARK=%%I"
python "%~dp0edit_plan.py" render-manifest "%PLAN%" --output "%OUTPUT_FOLDER%\render-manifest.json"
if errorlevel 1 (
  echo No se pudo validar el plan; no se renderizo nada.
  pause
  goto menu
)
if not defined WATERMARK (
  if defined RENDER_OVERWRITE (
    python "%~dp0render.py" "%OUTPUT_FOLDER%\render-manifest.json" --output "%OUTPUT_VIDEO%" --overwrite
  ) else (
    python "%~dp0render.py" "%OUTPUT_FOLDER%\render-manifest.json" --output "%OUTPUT_VIDEO%"
  )
) else (
  if defined RENDER_OVERWRITE (
    python "%~dp0render.py" "%OUTPUT_FOLDER%\render-manifest.json" --output "%OUTPUT_VIDEO%" --watermark "%WATERMARK%" --overwrite
  ) else (
    python "%~dp0render.py" "%OUTPUT_FOLDER%\render-manifest.json" --output "%OUTPUT_VIDEO%" --watermark "%WATERMARK%"
  )
)
if errorlevel 1 (
  echo El render fallo. Los videos originales no fueron modificados y una salida previa se conserva si la validacion falla.
) else (
  echo.
  echo Render terminado y validado: "%OUTPUT_VIDEO%"
)
pause
goto menu
