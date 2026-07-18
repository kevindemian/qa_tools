param(
    [string]$tool = "",
    [Alias('y')]
    [switch]$yes
)

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

# WSL detection — delegate to .sh (which launches the canonical entry-menu)
$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
if ($wsl -or $env:WSL_DISTRO_NAME) {
    $shPath = Join-Path $PSScriptRoot "qatools.sh"
    if ($tool) {
        wsl.exe -e bash $shPath $tool $args
    } else {
        wsl.exe -e bash $shPath $args
    }
    exit $LASTEXITCODE
}

# ── Windows native: delegate to the canonical TypeScript menu (entry-menu.ts) ──
# The interactive menu is implemented ONCE in shared/ui/entry-menu.ts. The ps1
# wrapper only validates prerequisites, then hands control to entry-menu — no
# duplicated tool-discovery / menu logic (DRY: single source of UI truth).
$scriptRoot = $PSScriptRoot
$entryMenu = Join-Path $scriptRoot "shared\ui\entry-menu.ts"

# Feature 1: Validate node
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "`n  ERRO: Node.js nao encontrado." -ForegroundColor Red
    Write-Host "  Instale em: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Feature 1b: Dependency check — auto-install if missing
$modulesPath = Join-Path $scriptRoot "node_modules"
if (-not (Test-Path $modulesPath)) {
    Write-Host "`n  Dependencias nao encontradas." -ForegroundColor Yellow
    $resp = if ($yes) { "S" } else { Read-Host "  Instalar agora? (S/N)" }
    if ($resp -eq "S" -or $resp -eq "s") {
        Write-Host ""
        npm install
    } else {
        Write-Host "  Execute 'npm install' na raiz do projeto e tente novamente." -ForegroundColor Yellow
        exit 1
    }
}

# Feature 2: Warn if .env missing
$envFile = Join-Path $scriptRoot ".env"
if (!(Test-Path $envFile)) {
    Write-Host "`n  AVISO: Arquivo .env nao encontrado em $scriptRoot" -ForegroundColor Yellow
    Write-Host "  Copie .env.example para .env e configure as variaveis." -ForegroundColor Yellow
    $resp = Read-Host "  Continuar mesmo assim? (S/N)"
    if ($resp -eq "n" -or $resp -eq "N") { exit }
}

# Delegate to the canonical interactive menu (entry-menu.ts).
# Repass $tool (first positional, used by the WSL branch) so no argument is lost.
& "npx" tsx "$entryMenu" $tool @args
exit $LASTEXITCODE
