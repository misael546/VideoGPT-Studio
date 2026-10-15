@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Cutter Studio - procesamiento local

:menu
cls
echo ========================================
echo           CUTTER STUDIO
echo   Los videos permanecen en tu PC
echo ========================================
echo.
echo 1. Analizar episodios y crear plan
echo 2. Renderizar un plan ya revisado
echo 3. Salir
echo.
set "CHOICE="
set /p "CHOICE=Selecciona una opcion: "

if "%CHOICE%"=="1" goto scan
if "%CHOICE%"=="2" goto render
if "%CHOICE%"=="3" exit /b 0
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
set "VIDEO_FOLDER="
set /p "VIDEO_FOLDER=Ruta de la carpeta con episodios: "
if not exist "%VIDEO_FOLDER%\" (
  echo ERROR: La carpeta no existe.
  pause
  goto menu
)
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
echo Se abrira el plan. Revisa los tiempos y marca approved como true
echo solo en los opening/endings que hayas confirmado.
start "" notepad "%VIDEO_FOLDER%\edit-plan.json"
echo Cuando termines de revisar, vuelve aqui y elige la opcion 2.
pause
goto menu

:render
call :check
if errorlevel 1 goto menu
echo.
set "PLAN="
set /p "PLAN=Ruta completa al edit-plan.json revisado: "
if not exist "%PLAN%" (
  echo ERROR: No encuentro ese archivo.
  pause
  goto menu
)
set "OUTPUT_FOLDER="
set /p "OUTPUT_FOLDER=Carpeta donde guardar el resultado: "
if not exist "%OUTPUT_FOLDER%\" (
  echo ERROR: La carpeta de salida no existe.
  pause
  goto menu
)
set "OUTPUT_VIDEO="
set /p "OUTPUT_VIDEO=Ruta completa del MP4 final (ej. D:\Anime\temporada-final.mp4): "
set "WATERMARK="
set /p "WATERMARK=Ruta de marca de agua PNG/JPG/WebP (Enter para omitir): "
python "%~dp0edit_plan.py" render-manifest "%PLAN%" --output "%OUTPUT_FOLDER%\render-manifest.json"
if errorlevel 1 (
  echo No se pudo validar el plan; no se renderizo nada.
  pause
  goto menu
)
if "%WATERMARK%"=="" (
  python "%~dp0render.py" "%OUTPUT_FOLDER%\render-manifest.json" --output "%OUTPUT_VIDEO%"
) else (
  python "%~dp0render.py" "%OUTPUT_FOLDER%\render-manifest.json" --output "%OUTPUT_VIDEO%" --watermark "%WATERMARK%"
)
if errorlevel 1 (
  echo El render fallo. Los videos originales no fueron modificados.
) else (
  echo.
  echo Render terminado: "%OUTPUT_VIDEO%"
)
pause
goto menu
