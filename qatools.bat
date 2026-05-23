@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM WSL detection — delegate to .sh
wsl.exe -e bash -c "exit" >nul 2>&1
if %errorlevel% equ 0 (
    for %%I in ("%~dp0.") do set "SH_PATH=%%~dpIqatools.sh"
    wsl.exe -e bash "!SH_PATH!" %*
    exit /b !errorlevel!
)

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

REM Feature 4: Auto-discover tools
set count=0
for /d %%i in ("%SCRIPT_DIR%*") do (
    set "dname=%%~nxi"
    if /i not "!dname!"=="node_modules" if /i not "!dname!"=="config" if /i not "!dname!"=="shared" if /i not "!dname!"==".git" (
        if exist "%%i\main.ts" (
            set /a count+=1
            set "tool_!count!=%%i"
            set "tname_!count!=!dname:_= !"
        )
    )
)

if %count% equ 0 (
    echo.
    echo   ERRO: Nenhuma ferramenta encontrada (nenhum */main.ts).
    pause
    exit /b 1
)

REM Feature 5: Read last choice
set lastChoice=
set lastNum=
if exist "%cacheFile%" set /p lastChoice=<"%cacheFile%"
if defined lastChoice (
    for /l %%i in (1,1,%count%) do if /i "!tname_%%i!"=="!lastChoice!" set lastNum=%%i
)

REM Check for direct argument
set directArg=%1
if not "%directArg%"=="" goto run_direct

:menu
cls
echo.
echo   ========================================
echo          QA Tools - Menu Principal
echo   ========================================
echo.
for /l %%i in (1,1,%count%) do (
    set "marker=  "
    if /i "!tname_%%i!"=="!lastChoice!" set "marker= *"
    echo   %%i!marker! !tname_%%i!
)
echo.
echo   0  Sair
echo.
echo   ========================================
if defined lastNum (
    for /l %%i in (1,1,%count%) do if "%%i"=="!lastNum!" echo   Ultima escolha: !tname_%%i! (%%i) - Enter para repetir
)
echo.
set /p "choice=  Escolha: "
if "!choice!"=="" if defined lastNum set "choice=!lastNum!"

if "%choice%"=="0" goto end

REM Validate choice
set valid=
for /l %%i in (1,1,%count%) do if "%%i"=="%choice%" set valid=1
if not defined valid (
    echo   Opcao invalida.
    timeout /t 2 >nul
    goto menu
)

REM Feature 5: Save last choice
set "saveName=!tname_%choice%!"
> "%cacheFile%" echo !saveName!
set "selectedPath=!tool_%choice%!"
goto run_selected

:run_direct
set selected=
for /l %%i in (1,1,%count%) do (
    if /i "!tname_%%i!"=="%directArg%" set selected=%%i
    if "%%i"=="%directArg%" set selected=%%i
)
if not defined selected (
    echo.
    echo   Ferramenta '%directArg%' nao encontrada.
    echo   Ferramentas disponiveis:
    for /l %%i in (1,1,%count%) do echo   !tname_%%i!
    echo.
    pause
    exit /b 1
)

set "saveName=!tname_%selected%!"
> "%cacheFile%" echo !saveName!
set "selectedPath=!tool_%selected%!"

:run_selected
REM Feature 3: Pass remaining args to tsx
npx tsx "!selectedPath!\main.ts" %*
if %errorlevel% neq 0 (
    echo.
    echo   Erro ao executar.
    pause
)
goto end

:end
echo   Ate logo!
timeout /t 1 >nul
endlocal
