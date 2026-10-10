@echo off
REM ============================================================
REM iGCraftLit Community - 快捷启动入口
REM 双击此文件即可启动项目，启动后本窗口自动关闭
REM ============================================================

chcp 65001 >nul

set "PROJECT_ROOT=%~dp0"

echo ============================================================
echo   iGCraftLit Community - Launching...
echo ============================================================
echo.

REM ===== 1. 检测并启动 PostgreSQL =====
echo [1/3] Checking PostgreSQL...
docker ps --filter "name=igm-postgres" --format "{{.Names}}" 2>nul | findstr /x "igm-postgres" >nul
if errorlevel 1 (
    echo   PostgreSQL not running. Starting...
    docker start igm-postgres 2>nul
    if errorlevel 1 (
        echo   Creating new container...
        docker run -d --name igm-postgres -p 5432:5432 ^
            -e POSTGRES_USER=iguser ^
            -e POSTGRES_PASSWORD=igpassword ^
            -e POSTGRES_DB=igcraftlit ^
            postgres:16-alpine >nul 2>nul
        timeout /t 5 /nobreak >nul
    )
)
echo   PostgreSQL is ready.

REM ===== 2. 检测 Bun =====
echo [2/3] Checking Bun...
where bun >nul 2>nul
if errorlevel 1 (
    echo   [ERROR] Bun not found! Install from https://bun.sh/
    echo   Run: powershell -c "irm bun.sh/install.ps1 | iex"
    pause
    exit /b 1
)

REM ===== 3. 启动前后端（新窗口后台运行） =====
echo [3/3] Starting frontend + backend...
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:3001
echo   Health:    http://localhost:3001/G_Api_Health
echo.
echo   Starting in background... this window will close automatically.
echo ============================================================

REM 在新的 cmd 窗口中运行 bun run dev，当前窗口立即退出
cd /d "%PROJECT_ROOT%"
start "iGCraftLit Dev" cmd /k "title iGCraftLit Dev && cd /d "%PROJECT_ROOT%" && Remove-Item Env:BUN_INSPECT_CONNECT_TO -ErrorAction SilentlyContinue; bun run dev"

REM 给用户 3 秒看一下提示，然后本窗口自动关闭
timeout /t 3 /nobreak >nul
exit
