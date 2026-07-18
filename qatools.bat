@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM WSL detection — delegate to .sh (which launches the canonical entry-menu)
wsl.exe -e bash -c "exit" >nul 2>&1
if %errorlevel% equ 0 (
    for %%I in ("%~dp0.") do set "SH_PATH=%%~dpIqatools.sh"
    wsl.exe -e bash "!SH_PATH!" %*
    exit /b !errorlevel!
)

REM ── Windows native: delegate to the canonical TypeScript menu (entry-menu.ts) ──
REM The interactive menu is implemented ONCE in shared\ui\entry-menu.ts. The bat
REM wrapper only validates prerequisites, then hands control to entry-menu — no
REM duplicated tool-discovery / menu logic (DRY: single source of UI truth).
set "ENTRY_MENU=%~dp0shared\ui\entry-menu.ts"

set "SCRIPT_DIR=%~dp0"
set "cacheFile=%TEMP%\qa_tools_last_choice.txt"

REM Feature 1: Validate node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo   ERRO: Node.js nao encontrado.
    echo   Instale em: https://nodejs.org
    pause
    exit /b 1
)

REM Feature 1b: Dependency check — auto-install if missing
if not exist "%SCRIPT_DIR%node_modules\" (
    echo.
    echo   Dependencias nao encontradas.
    set /p "resp=  Instalar agora? (S/N): "
    if /i not "!resp!"=="S" (
        echo.
        echo   Execute 'npm install' na raiz do projeto e tente novamente.
        pause
        exit /b 1
    )
    echo.
    call npm install
)

REM Feature 2: Warn if .env missing
if not exist "%SCRIPT_DIR%.env" (
    echo.
    echo   AVISO: Arquivo .env nao encontrado em %SCRIPT_DIR%
    echo   Copie .env.example para .env e configure as variaveis.
    set /p "cont=  Continuar mesmo assim? (S/N): "
    if /i "!cont!"=="N" exit /b
)

REM Delegate to the canonical interactive menu (entry-menu.ts)
npx tsx "%ENTRY_MENU%" %*
if %errorlevel% neq 0 (
    echo.
    echo   Erro ao executar o menu.
    pause
)
goto end

:end
echo   Ate logo!
timeout /t 1 >nul
endlocal
