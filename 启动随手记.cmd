@echo off
chcp 65001 >nul
cd /d "%~dp0"

start "" /min cmd /c "py -m http.server 8765 --bind 127.0.0.1 >nul 2>&1 || python -m http.server 8765 --bind 127.0.0.1 >nul 2>&1"

timeout /t 2 /nobreak >nul

set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" "http://localhost:8765/"
) else (
  start "" "http://localhost:8765/"
)

exit /b 0
