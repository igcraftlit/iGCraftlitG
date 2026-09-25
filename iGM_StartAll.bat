@echo off
REM ============================================================
REM iGCraftLit Community - All-in-one launcher
REM File : D:\IGWEB\iGM_StartAll.bat
REM Starts three parts in separate windows:
REM   1. Backend   Bun + Elysia       http://localhost:3001
REM   2. Frontend  Next.js dev        http://localhost:3000
REM   3. Tunnel    cloudflared        https://api.igcraftlit.com
REM                                 -> http://localhost:3001
REM Static site https://igcraftlit.com is hosted on Cloudflare
REM Pages (always online); its API only works when this tunnel
REM and the local backend are running.
REM
REM Usage : double-click, or  iGM_StartAll.bat  in CMD
REM Stop  : close the three service windows (or Ctrl+C in them)
REM Note  : ASCII-only content to avoid codepage issues
REM ============================================================

setlocal EnableDelayedExpansion
title iGM Launcher - igcraftlit
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "CLOUDFLARED=C:\Program Files (x86)\cloudflared\cloudflared.exe"
set "TUNNEL_CFG=%USERPROFILE%\.cloudflared\config.yml"
set "HEALTH=/G_Api_Health"

echo ============================================================
echo   iGCraftLit Launcher  (local + api.igcraftlit.com)
echo ============================================================

REM ---------- 0. Environment checks ----------
where bun >nul 2>nul
if errorlevel 1 (
  echo [FAIL] Bun not found in PATH. Install: https://bun.sh
  goto :end_pause
)
if not exist "%CLOUDFLARED%" (
  echo [FAIL] cloudflared not found: %CLOUDFLARED%
  goto :end_pause
)
if not exist "%TUNNEL_CFG%" (
  echo [FAIL] Tunnel config not found: %TUNNEL_CFG%
  goto :end_pause
)
echo [ OK ] bun / cloudflared / tunnel config all present
cd /d "%ROOT%" || (
  echo [FAIL] Cannot enter %ROOT%
  goto :end_pause
)

REM ---------- 1. Clean stale processes on :3000 / :3001 ----------
echo.
echo [1/5] Cleaning stale processes on port 3000 / 3001 ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000 "') do (
  if not "%%p"=="0" if not "%%p"=="4" echo        kill PID %%p ^(:3000^) & taskkill /PID %%p /F >nul 2>nul
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3001 "') do (
  if not "%%p"=="0" if not "%%p"=="4" echo        kill PID %%p ^(:3001^) & taskkill /PID %%p /F >nul 2>nul
)
taskkill /IM cloudflared.exe /F >nul 2>nul
ping 127.0.0.1 -n 3 >nul

REM ---------- 2. Dependencies ----------
echo [2/5] Installing / checking dependencies (bun workspaces) ...
call bun install
if errorlevel 1 (
  echo [FAIL] "bun install" failed
  goto :end_pause
)

REM ---------- 3. Database init (auto migration also runs on boot) ----------
echo [3/5] Initializing local SQLite database ...
call bun run db:init
if errorlevel 1 (
  echo [WARN] db:init reported an error, continuing anyway ^(auto-migrate on boot^)
)

REM ---------- 4. Launch three service windows ----------
echo [4/5] Launching service windows ...
start "iGM-Server :3001" cmd /k "cd /d %ROOT%\iGM_Server && bun run dev"
start "iGM-Web :3000" cmd /k "cd /d %ROOT%\apps\web && bun run dev"
start "iGM-Tunnel api.igcraftlit.com" "%CLOUDFLARED%" tunnel --config "%TUNNEL_CFG%" run igcraftlit-api

REM ---------- 5. Readiness probes ----------
echo [5/5] Waiting for services to become ready ...
echo.

set /a TRY=0
:wait_backend
set /a TRY+=1
curl.exe -s -m 3 "http://localhost:3001%HEALTH%" | findstr /C:"\"success\":true" >nul 2>nul
if not errorlevel 1 goto :backend_ok
if %TRY% geq 30 goto :backend_fail
ping 127.0.0.1 -n 3 >nul
goto :wait_backend
:backend_ok
echo [ OK ] Backend  ready  -^> http://localhost:3001
goto :probe_frontend
:backend_fail
echo [FAIL] Backend did not start on http://localhost:3001
echo        Check the "iGM-Server :3001" window for errors.

:probe_frontend
set /a TRY=0
:wait_frontend
set /a TRY+=1
for /f %%c in ('curl.exe -s -m 5 -o nul -w "%%{http_code}" "http://localhost:3000/zh-CN"') do set "WEBCODE=%%c"
if "%WEBCODE%"=="200" goto :frontend_ok
if %TRY% geq 45 goto :frontend_fail
ping 127.0.0.1 -n 3 >nul
goto :wait_frontend
:frontend_ok
echo [ OK ] Frontend ready  -^> http://localhost:3000
goto :probe_tunnel
:frontend_fail
echo [FAIL] Frontend did not start on http://localhost:3000 ^(last code %WEBCODE%^)
echo        Check the "iGM-Web :3000" window for errors.

:probe_tunnel
set /a TRY=0
:wait_tunnel
set /a TRY+=1
curl.exe -s -m 6 "https://api.igcraftlit.com%HEALTH%" | findstr /C:"\"success\":true" >nul 2>nul
if not errorlevel 1 goto :tunnel_ok
if %TRY% geq 20 goto :tunnel_fail
ping 127.0.0.1 -n 4 >nul
goto :wait_tunnel
:tunnel_ok
echo [ OK ] Tunnel   ready  -^> https://api.igcraftlit.com
goto :summary
:tunnel_fail
echo [WARN] Tunnel not reachable yet: https://api.igcraftlit.com
echo        First connection can take ~30s. Check the tunnel window
echo        and retry:  curl https://api.igcraftlit.com/G_Api_Health

:summary
echo.
echo ============================================================
echo   URLs
echo   Local app : http://localhost:3000/zh-CN/G_Home
echo   Local API : http://localhost:3001/G_Api_Health
echo   Public API: https://api.igcraftlit.com/G_Api_Health
echo   Public web: https://igcraftlit.com  (Cloudflare Pages)
echo ------------------------------------------------------------
echo   The three services run in their own windows.
echo   This control window can be closed safely.
echo   To stop: close the service windows (or Ctrl+C in them).
echo ============================================================
start "" "http://localhost:3000/zh-CN/G_Home"

:end_pause
echo.
pause
endlocal
