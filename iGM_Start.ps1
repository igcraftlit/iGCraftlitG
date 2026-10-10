<#
.SYNOPSIS
    iGCraftLit Community - Quick Start Script

.DESCRIPTION
    One-click startup for dev environment. Auto-detects dependencies, starts PostgreSQL,
    launches both frontend (Next.js on 3000) and backend (Elysia on 3001).

.NOTES
    Windows PowerShell 5.x compatible
    UTF-8 with BOM required for Chinese characters
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Test-PgContainer {
    $r = docker ps --filter "name=igm-postgres" --format "{{.Names}}" 2>$null
    return ($r -eq "igm-postgres")
}

function Test-DbReady {
    try {
        $r = docker exec igm-postgres pg_isready -U iguser -d igcraftlit 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

function Test-Deps {
    return (Test-Path "$ProjectRoot\apps\web\node_modules") -and
           (Test-Path "$ProjectRoot\iGM_Server\node_modules")
}

function Check-Env {
    Write-Host ""
    Write-Host "========== Environment Check ==========" -ForegroundColor Magenta

    if (Test-Cmd "bun") {
        Write-Host "  [OK] Bun: $(bun --version)" -ForegroundColor Green
    } else {
        Write-Host "  [!!] Bun not installed. Install: irm bun.sh/install.ps1 | iex" -ForegroundColor Red
    }

    if (Test-Cmd "docker") {
        Write-Host "  [OK] Docker found" -ForegroundColor Green
    } else {
        Write-Host "  [!!] Docker not found. Install: https://www.docker.com/" -ForegroundColor Red
        return
    }

    if (Test-PgContainer) {
        Write-Host "  [OK] PostgreSQL running" -ForegroundColor Green
    } else {
        Write-Host "  [..] Starting PostgreSQL container..." -ForegroundColor Yellow
        docker start igm-postgres 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [..] Creating new container..." -ForegroundColor Yellow
            docker run -d --name igm-postgres -p 5432:5432 -e POSTGRES_USER=iguser -e POSTGRES_PASSWORD=igpassword -e POSTGRES_DB=igcraftlit postgres:16-alpine 2>$null
            Start-Sleep 5
        }
    }

    if (Test-DbReady) {
        Write-Host "  [OK] Database ready" -ForegroundColor Green
    } else {
        Write-Host "  [..] Waiting for database..." -ForegroundColor Yellow
        Start-Sleep 5
    }

    if (Test-Deps) {
        Write-Host "  [OK] Dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "  [..] Installing dependencies..." -ForegroundColor Yellow
        Push-Location $ProjectRoot
        bun install
        Pop-Location
    }

    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host ""
}

function Start-Dev {
    Write-Host ""
    Write-Host ">>> Starting dev mode (frontend + backend) <<<" -ForegroundColor Green
    Write-Host "    Frontend:  http://localhost:3000"
    Write-Host "    Backend:   http://localhost:3001"
    Write-Host "    Press Ctrl+C to stop both" -ForegroundColor Gray
    Write-Host ""

    Remove-Item Env:BUN_INSPECT_CONNECT_TO -ErrorAction SilentlyContinue
    Push-Location $ProjectRoot
    bun run dev
    Pop-Location
}

function Start-Backend {
    Write-Host ""
    Write-Host ">>> Starting backend only <<<" -ForegroundColor Green
    Write-Host "    http://localhost:3001"
    Write-Host ""
    Remove-Item Env:BUN_INSPECT_CONNECT_TO -ErrorAction SilentlyContinue
    Push-Location $ProjectRoot
    bun run dev:server
    Pop-Location
}

function Start-Frontend {
    Write-Host ""
    Write-Host ">>> Starting frontend only <<<" -ForegroundColor Green
    Write-Host "    http://localhost:3000"
    Write-Host ""
    Remove-Item Env:BUN_INSPECT_CONNECT_TO -ErrorAction SilentlyContinue
    Push-Location $ProjectRoot
    bun run dev:web
    Pop-Location
}

function Do-Build {
    Write-Host ""
    Write-Host ">>> Building production site <<<" -ForegroundColor Green
    Remove-Item Env:BUN_INSPECT_CONNECT_TO -ErrorAction SilentlyContinue
    Push-Location $ProjectRoot
    bun run build
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "  Build succeeded! Output: apps\web\out" -ForegroundColor Green
    } else {
        Write-Host "  Build FAILED - see errors above" -ForegroundColor Red
    }
    Pop-Location
}

function Do-DbInit {
    Write-Host ""
    Write-Host ">>> Initializing database <<<" -ForegroundColor Green
    Push-Location $ProjectRoot
    bun run db:init
    Pop-Location
}

function Show-Help {
    Write-Host @"

========================================
  iGCraftLit Community Info
========================================

  Local Dev:
    Frontend:  http://localhost:3000
    Backend:   http://localhost:3001
    Health:    http://localhost:3001/api/G_Health

  Production:
    Site:      https://igcraftlit.com
    API:       https://api.igcraftlit.com
    Download:  https://download.igcraftlit.com

  Repo:       https://github.com/igcraftlit/iGCraftlitG

  Quick Commands:
    bun run dev           Start both FE + BE
    bun run dev:web       Frontend only
    bun run dev:server    Backend only
    bun run build         Production build
    bun run db:init       Init database
    bun run db:migrate    Run migrations

  Docs:       iGM_Startup.md

========================================

"@ -ForegroundColor Cyan
}

# Main entry
param([switch]$AutoStart)

if ($AutoStart) {
    Check-Env
    Start-Dev
} else {
    Check-Env
    while ($true) {
        Write-Host @"

========================================
  iGCraftLit Community Launcher
========================================

  [1] Start All (FE + BE)     - recommended
  [2] Backend Only            - API server
  [3] Frontend Only           - Next.js dev
  [4] Build Production        - static site
  [5] Init Database           - reset DB
  [6] Check Environment       - re-detect
  [7] Show Info               - addresses, commands
  [0] Exit

========================================

"@ -ForegroundColor White

        $c = Read-Host "Select [0-7]"
        switch ($c) {
            "1" { Start-Dev }
            "2" { Start-Backend }
            "3" { Start-Frontend }
            "4" { Do-Build }
            "5" { Do-DbInit }
            "6" { Check-Env }
            "7" { Show-Help; pause }
            "0" { Write-Host "Bye!" -ForegroundColor Green; exit }
            default { Write-Host "Invalid option" -ForegroundColor Yellow; pause }
        }
    }
}
