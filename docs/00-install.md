# 00 — Instalação e Configuração

Guia de instalação para desenvolvedores.  
Público-alvo: usuários de CLI com Node.js 20+.

---

## Pré-requisitos

| Ferramenta  | Versão mínima |
| ----------- | ------------- |
| **Node.js** | 20+           |
| **npm**     | 9+            |
| **Git**     | qualquer      |

Verifique:

```bash
node -v   # v20.x ou superior
npm -v    # 9.x ou superior
git --version
```

---

## Clone + Instalação

```bash
git clone <url-do-repositorio>
cd qa_tools
npm install
```

O `npm install` baixa todas as dependências listadas em `package.json`.

---

## Arquivo `.env`

Todas as variáveis de ambiente lidas por `shared/config.ts`:

### Obrigatórias (Jira/Xray)

| Variável              | Descrição                  |
| --------------------- | -------------------------- |
| `JIRA_BASE_URL`       | URL base do servidor Jira  |
| `JIRA_PERSONAL_TOKEN` | Token de autenticação Jira |
| `XRAY_BASE_URL`       | URL base do servidor Xray  |

### GitLab (opcional)

| Variável       | Descrição                    |
| -------------- | ---------------------------- |
| `GIT_BASE_URL` | URL base do servidor GitLab  |
| `GIT_TOKEN`    | Token de autenticação GitLab |

### GitHub (opcional)

| Variável         | Descrição                    | Padrão                   |
| ---------------- | ---------------------------- | ------------------------ |
| `GITHUB_TOKEN`   | Token de autenticação GitHub | —                        |
| `GITHUB_API_URL` | URL da API do GitHub         | `https://api.github.com` |

### Projeto Jira

| Variável       | Descrição                | Padrão   |
| -------------- | ------------------------ | -------- |
| `JIRA_PROJECT` | Chave do projeto no Jira | `ECSPOL` |

### Caminhos de importação

| Variável               | Descrição                           |
| ---------------------- | ----------------------------------- |
| `CSV_PATH`             | Caminho do arquivo CSV de steps     |
| `CSV_DEFAULT_PATH`     | Caminho padrão alternativo para CSV |
| `CSV_LABELS`           | Labels para importação CSV          |
| `JSON_PATH`            | Caminho do arquivo JSON de testes   |
| `JSON_LABELS`          | Labels para importação JSON         |
| `CYPRESS_PROJECT_PATH` | Caminho raiz do projeto Cypress     |

### Log

| Variável            | Descrição                                 | Padrão           |
| ------------------- | ----------------------------------------- | ---------------- |
| `LOG_LEVEL`         | Nível de log (DEBUG, INFO, WARN, ERROR)   | `INFO`           |
| `LOG_FILE`          | Habilitar log em arquivo (`true`/`false`) | —                |
| `LOG_DIR`           | Diretório dos arquivos de log             | `logs`           |
| `LOG_MAX_SIZE`      | Tamanho máximo do log em bytes            | `5242880` (5 MB) |
| `QA_TOOLS_LOGS_DIR` | Sobrescreve `LOG_DIR` (maior prioridade)  | —                |

### Comportamento

| Variável               | Descrição                                         | Padrão     |
| ---------------------- | ------------------------------------------------- | ---------- |
| `DEBUG`                | Modo debug (`true`/`false`)                       | —          |
| `QUIET`                | Suprime output informativo (`true`/`false`)       | —          |
| `DRY_RUN`              | Simula requisições sem executar (`true`/`false`)  | —          |
| `AUTO_CONFIRM`         | Pula confirmações interativas (`true`/`false`)    | —          |
| `AUTO_CHOICE`          | Seleção automática no menu interativo             | —          |
| `ON_ERROR`             | Ação ao encontrar erro (`abort`/`continue`)       | `abort`    |
| `XDG_STATE_HOME`       | Diretório de estado (cache/state)                 | —          |
| `QA_TOOLS_TEMP_DIR`    | Diretório temporário (previews, cache, docs HTML) | `temp/`    |
| `QA_TOOLS_REPORTS_DIR` | Diretório de relatórios gerados (HTML, flakiness) | `reports/` |

### Exemplo (`.env.example`)

```bash
# === Jira ===
JIRA_BASE_URL=https://jira.empresa.com
JIRA_PERSONAL_TOKEN=seu-token-aqui
XRAY_BASE_URL=https://xray.empresa.com

# === GitLab ===
GIT_BASE_URL=https://gitlab.empresa.com
GIT_TOKEN=seu-token-aqui

# === Opcionais ===
CYPRESS_PROJECT_PATH=/caminho/para/cypress
CSV_DEFAULT_PATH=./test_steps.csv
JIRA_PROJECT=ECSPOL
LOG_LEVEL=INFO
LOG_FILE=true
LOG_DIR=logs
DEBUG=false
QUIET=false
DRY_RUN=false
AUTO_CONFIRM=false
AUTO_CHOICE=
ON_ERROR=abort
XDG_STATE_HOME=
```

Crie seu `.env`:

```bash
cp .env.example .env
# edite .env com seus dados
```

---

## Wrappers cross-platform

O projeto inclui três wrappers que **auto-descobrem** ferramentas (diretórios com `main.ts`), oferecem menu interativo, instalam dependências automaticamente e alertam se `.env` estiver ausente.

| Arquivo       | Plataforma         | Uso             |
| ------------- | ------------------ | --------------- |
| `qatools.sh`  | Linux / macOS      | `./qatools.sh`  |
| `qatools.bat` | Windows CMD        | `qatools.bat`   |
| `qatools.ps1` | Windows PowerShell | `.\qatools.ps1` |

Comportamento comum:

- Se `node_modules/` não existir, pergunta se deseja instalar (`npm install`)
- Se `.env` não existir, exibe aviso e pergunta se deseja continuar
- Lista ferramentas disponíveis em menu numerado
- Lembra a última escolha (arquivo de cache em `$TMPDIR` / `%TEMP%`)
- Aceita argumento direto: `./qatools.sh jira_management`

---

## Modo Batch

> Execução não-interativa para pipelines CI/CD. Útil quando você precisa disparar pipeline, coletar resultados, analisar falhas e gerar dashboard de flakiness em um único comando, sem prompts.

```bash
# Disparar pipeline no projeto padrão, branch main
npx tsx git_triggers/main.ts --batch

# Projeto e branch específicos
npx tsx git_triggers/main.ts --batch --project qa_ibabs --branch release/v2
```

**Flags disponíveis:**

| Flag                   | Descrição                                               |
| ---------------------- | ------------------------------------------------------- |
| `--batch` ou `--auto`  | Ativa modo batch (implica `AUTO_CONFIRM=true`)          |
| `--project` / `-p`     | Nome do projeto (fallback: primeiro do `projects.json`) |
| `--branch` / `-b`      | Branch para disparo (fallback: `main`)                  |
| `--run-impacted-tests` | Seleciona testes impactados pelo diff para execução     |
| `--conservative`       | Modo conservador: smoke obrigatórios + testes afetados  |

O batch mode executa o pipeline, faz polling até conclusão, coleta resultados, oferece análise IA de falhas (se houver), gera dashboard de flakiness, executa auto-actions para testes flaky e exibe resumo da sessão.

> Consulte [`docs/03-git-triggers.md`](03-git-triggers.md) para documentação completa do batch mode e flags avançadas.

---

## Verificação

```bash
npm run typecheck    # tsc --noEmit, zero erros esperado
npm test             # jest, 100% dos testes
npm run lint         # eslint --ext .ts
```

---

## Git Hooks

O hook **pre-push** executa typecheck + testes antes de cada `git push`.

Ativação manual:

```bash
git config core.hooksPath .githooks
```

Para pular em emergência:

```bash
git push --no-verify
```

---

## Auto-setup de CI/CD

Para gerar automaticamente pipelines CI (GitHub Actions / GitLab CI), configuração de projeto e hook pre-push:

```bash
npx tsx setup/main.ts
```

O wizard interativo detecta o framework de testes (Cypress/Playwright/Jest/Vitest) a partir do `package.json`, pergunta as features desejadas (Jira, flakiness, análise IA) e gera:

- `.github/workflows/qa.yml` ou `.gitlab-ci.yml`
- `config/projects.json` + `config/providers.json`
- `.env.example` com as variáveis necessárias
- Hook `.git/hooks/pre-push` (opcional)

Consulte [`docs/10-setup-wizard.md`](10-setup-wizard.md) para detalhes.

---

## Auto-setup

```bash
bash setup.sh
```

O script `setup.sh` executa em sequência:

1. Valida Node.js >= 20
2. Respeita `.nvmrc` se `nvm` estiver disponível
3. Instala dependências com `npm ci`
4. Configura hooks (`core.hooksPath = .githooks`)
5. Executa `npx tsc --noEmit`
6. Alerta se `.env` não existir

---

← [Voltar ao README](../README.md)
