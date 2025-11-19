@echo off
setlocal

set PORT=5500
set DIST=dist

echo === Robot Simulator - Servidor Local ===
echo Servir carpeta "%DIST%" en http://localhost:%PORT%
echo.

REM 1) Python embebido local (carpeta .\python)
if exist ".\python\python.exe" (
  echo Usando Python embebido...
  cd "%DIST%"
  "..\python\python.exe" -m http.server %PORT%
  goto :eof
)

REM 2) Python instalado en el sistema (por si acaso)
python --version >nul 2>&1
if %ERRORLEVEL%==0 (
  echo Usando Python instalado en el sistema...
  cd "%DIST%"
  python -m http.server %PORT%
  goto :eof
)

REM 3) Node instalado (alternativa)
node --version >nul 2>&1
if %ERRORLEVEL%==0 (
  echo Usando Node (http-server)...
  npx --yes http-server "%DIST%" -p %PORT% -c-1
  goto :eof
)

echo No se encontro ninguna forma de levantar un servidor (ni Python embebido ni Python ni Node).
echo Revisa que la carpeta "python" este al lado de este .bat.
pause
