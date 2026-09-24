@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PY=%~dp0runtime\python\python.exe"
set "SCRIPT=%~dp0serve.py"

if not exist "%PY%" (
  echo ERROR: Portable Python not found:
  echo   %PY%
  echo Copy the whole EruditQuartetPad folder including runtime\python
  echo.
  pause
  exit /b 1
)

if not exist "%SCRIPT%" (
  echo ERROR: serve.py not found.
  pause
  exit /b 1
)

echo Starting EruditQuartetPad...
echo Operator: http://127.0.0.1:3852/
echo Hall: one button on the other monitor
echo.
"%PY%" "%SCRIPT%"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo Exit code: %ERR%
  pause
)
endlocal & exit /b %ERR%
