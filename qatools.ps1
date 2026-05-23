param(
    [string]$tool = "",
    [Alias('y')]
    [switch]$yes
)

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

# WSL detection — delegate to .sh
$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
if ($wsl -or $env:WSL_DISTRO_NAME) {
    $shPath = Join-Path $PSScriptRoot "qatools.sh"
    wsl.exe -e bash $shPath $args
    exit $LASTEXITCODE
}

$scriptRoot = $PSScriptRoot
$cacheFile = Join-Path $env:TEMP "qa_tools_last_choice.txt"

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
    if ($tool -ne "0") {
        $resp = Read-Host "  Continuar mesmo assim? (S/N)"
        if ($resp -eq "n" -or $resp -eq "N") { exit }
    }
}

# Feature 4: Auto-discover tools
$tools = Get-ChildItem -Path $scriptRoot -Directory | Where-Object {
    $_.Name -notin @("node_modules", "config", "shared", ".git") -and
    (Test-Path (Join-Path $_.FullName "main.ts"))
} | ForEach-Object {
    $display = $_.Name -replace '_', ' '
    $display = (Get-Culture).TextInfo.ToTitleCase($display.ToLower())
    @{ Name = $_.Name; Display = $display; Path = Join-Path $_.FullName "main.ts" }
}

if ($tools.Count -eq 0) {
    Write-Host "`n  ERRO: Nenhuma ferramenta encontrada (nenhum */main.ts)." -ForegroundColor Red
    exit 1
}

# Feature 5: Read last choice
$lastChoice = ""
$lastIndex = -1
if (Test-Path $cacheFile) {
    try { $lastChoice = (Get-Content $cacheFile -Raw -Encoding UTF8).Trim() } catch {}
}
if ($lastChoice) {
    for ($i = 0; $i -lt $tools.Count; $i++) {
        if ($tools[$i].Name -eq $lastChoice) { $lastIndex = $i + 1; break }
    }
}

function Save-Choice($name) {
    try { $name | Out-File -FilePath $cacheFile -Encoding UTF8 -Force } catch {}
}

function Run-Tool($selected) {
    Save-Choice $selected.Name
    $tsxArgs = @("tsx") + @($selected.Path) + $extraArgs
    & "npx" $tsxArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n  Erro ao executar. Pressione Enter para sair." -ForegroundColor Red
        Read-Host
    }
}

# Feature 3: Remaining args passed to node
$extraArgs = $args

if (-not $tool) {
    # Interactive menu
    Clear-Host
    Write-Host "`n  ========================================" -ForegroundColor Cyan
    Write-Host "          QA Tools - Menu Principal" -ForegroundColor Cyan
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host ""
    for ($i = 0; $i -lt $tools.Count; $i++) {
        $marker = if ($tools[$i].Name -eq $lastChoice) { " *" } else { "  " }
        Write-Host "   $($i + 1)$marker $($tools[$i].Display)" -ForegroundColor Green
    }
    Write-Host ""
    Write-Host "   0  Sair" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Cyan
    if ($lastIndex -ge 0) {
        Write-Host "  Ultima escolha: $($tools[$lastIndex - 1].Display) ($lastIndex) - Enter para repetir" -ForegroundColor DarkGray
    }

    $choice = Read-Host "`n  Escolha"
    if ($choice -eq "" -and $lastIndex -ge 0) { $choice = "$lastIndex" }
    if ($choice -eq "0") { Write-Host "  Ate logo!" -ForegroundColor Cyan; exit }

    $parsed = 0
    if ([int]::TryParse($choice, [ref]$parsed)) {
        $index = $parsed - 1
        if ($index -ge 0 -and $index -lt $tools.Count) {
            Run-Tool $tools[$index]
        } else {
            Write-Host "  Opcao invalida." -ForegroundColor Red
            exit 1
        }
    } else {
        $matched = $tools | Where-Object { $_.Name -eq $choice -or $_.Display -eq $choice }
        if ($matched) {
            Run-Tool $matched
        } else {
            Write-Host "  Opcao invalida." -ForegroundColor Red
            exit 1
        }
    }
} else {
    # Direct argument
    $selected = $null
    $parsed = 0
    if ([int]::TryParse($tool, [ref]$parsed)) {
        $index = $parsed - 1
        if ($index -ge 0 -and $index -lt $tools.Count) {
            $selected = $tools[$index]
        }
    } else {
        $selected = $tools | Where-Object { $_.Name -eq $tool } | Select-Object -First 1
    }

    if ($selected) {
        Run-Tool $selected
    } else {
        Write-Host "  Ferramenta '$tool' nao encontrada." -ForegroundColor Red
        Write-Host "  Ferramentas disponiveis:" -ForegroundColor Yellow
        $tools | ForEach-Object { Write-Host "   $($_.Name)  ($($_.Display))" }
        exit 1
    }
}
