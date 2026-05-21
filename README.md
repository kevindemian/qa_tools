# QA Tools

Ferramentas internas de automação QA para gerenciamento de releases no Jira/Xray, triggers de pipeline no GitLab e reporting Cypress.

## Setup

```bash
cp .env.example .env   # edite com seus tokens
npm install            # instala dependências
npm run typecheck      # verifica tipos (opcional, 0 erros esperado)
```

**Pré-requisitos:** Node.js 18+, npm 9+.

### Git Hooks (opcional, recomendado)

Hooks rodam `typecheck + tests` antes de cada push. Configuração única:

```bash
git config core.hooksPath .githooks
```

Para pular hooks (emergência): `git push --no-verify`.

O CI (`test` job no `.gitlab-ci.yml`) cobre o mesmo escopo — hooks são complementares (falham rápido localmente antes de enviar).

## Quick Start

**Pré-requisitos:** Node.js 18+, npm 9+.

```bash
cp .env.example .env       # edite com seus tokens Jira/Xray
npm install                # instala dependencias
npm run typecheck          # verifica tipos (0 erros)
npm test                   # 134 testes, 14 suites
```

Crie um arquivo `testes.csv`:
```csv
Title: TC01 - Login valido
Description: "Verifica login com credenciais validas."
Pre-condition: "User must be logged out"
Action,Data,Expected Result
Acessar /login,https://app.com,Formulario exibido
Preencher email,admin@test.com,Campo aceita valor
Clicar em Entrar,,Redirecionado para dashboard
---
Title: TC02 - Login invalido
Description: "Testa mensagem de erro com senha incorreta."
Pre-condition: "User must be logged out"
Action,Data,Expected Result
Acessar /login,https://app.com,Formulario exibido
Digitar senha,senha_errada,Mensagem de erro exibida
```

Execute a importacao:
```bash
AUTO_CONFIRM=false node jira_management/main.js
# Escolha opcao 1 e informe o caminho do CSV
```

Dependências instaladas:
- `axios` — requisições HTTP para APIs REST
- `csv-parser` — parsing de CSV de steps de teste
- `dotenv` — carregamento de variáveis de ambiente
- `readline-sync` — input interativo no terminal

---

## Arquitetura

```
qa_tools/
├── config/
│   ├── projects.json          # IDs dos projetos (GitLab) ou owner/repo (GitHub)
│   ├── providers.json         # Tipo de provedor por projeto (gitlab|github)
│   └── reviewers.json         # IDs dos revisores para MRs
├── jira_management/
│   ├── main.js                # CLI entry point (menu 0-12)
│   ├── create_tests.js        # Criação de testes via CSV (extraído de main.js)
│   ├── jira_resource.js       # Wrapper REST para API Jira Server
│   ├── jira_link_manager.js   # Link types + pre-conditions
│   ├── csv_resource.js        # Parser de CSV no formato QA Tools
│   ├── cypress_resource.js    # Relatórios Cypress
│   ├── cypress_test.js        # Parse de resultados de teste Cypress
│   ├── package_version_manager.js  # Atualização de package.json + release notes
│   ├── csv_resource.test.js   # Testes do parser CSV (12)
│   ├── jira_resource.test.js  # Testes do link manager (8)
│   └── jira_validator.test.js # Testes de validação CSV + Jira (14)
├── git_triggers/
│   ├── main.js                # CLI entry point (menu 0-9)
│   ├── gitlab_manager.js      # Wrapper REST para API GitLab
│   ├── github_manager.js      # Wrapper REST para API GitHub
│   └── nivelar.js             # Nivelamento de branches (main→rel_cand→dev)
└── shared/
    ├── http-client.js         # Cliente HTTP unificado (timeout 120s + retry 3× com jitter)
    ├── state.js               # Estado persistente JSON (copy-on-write + backup .bak)
    ├── types.js               # JSDoc typedefs compartilhados (StateSchema, TestCase, etc.)
    ├── logger.js              # Logger estruturado (console + arquivo, níveis, masking)
    ├── logger.test.js         # Testes do logger (17)
    ├── prompt.js              # UX (cores, prompts, confirmação, progresso)
    ├── cli_base.js            # Bootstrap compartilhado (validateEnv, SIGINT, mask)
    └── tls.js                 # Factory de agente HTTPS corporativo
```

---

## Jira Management

Menu interativo com opções categorizadas em **TESTES**, **RELEASES**, **CONFIGURAÇÃO** e **UTILITÁRIOS**.

```bash
node jira_management/main.js
```

### TESTES

| Opção | Descrição |
|-------|-----------|
| 1 | **Criar testes a partir de CSV** — lê arquivo CSV, mostra preview, cria issues no Jira com steps, pre-conditions e linked issues |
| 2 | **Listar versões de release** — exibe últimas N versões lançadas + não lançadas |

### RELEASES

| Opção | Descrição |
|-------|-----------|
| 3 | **Criar nova versão** — cria versão não lançada no projeto |
| 4 | **Atribuir fixVersion** — adiciona tarefas a uma versão (com preview + sprint opcional) |
| 5 | **Atualizar package.json + release notes** — lê tarefas da versão, atualiza versão e release notes |
| 6 | **Verificar status das tarefas** — checa se todas as tarefas de uma versão estão Done/In Use |
| 7 | **Fechar tarefas automaticamente** — move tarefas de uma versão através do workflow até Done |
| 8 | **Publicar versão** — marca versão como released (valida se todas as tarefas estão concluídas) |

### CONFIGURAÇÃO

| Opção | Descrição |
|-------|-----------|
| 9 | **Alterar projeto Jira** — muda o projeto alvo |
| 10 | **Alterar diretório git** — muda pasta para atualização de package.json |
| 14 | **Alterar diretório Cypress** — muda pasta para geração de mapping JSON+MD |

### UTILITÁRIOS

| Opção | Descrição |
|-------|-----------|
| 11 | **Gerar template CSV** — cria arquivo `test_steps_template.csv` com exemplo didático |
| 12 | **Diagnosticar conexão** — testa conectividade com Jira API, Xray API e projeto |
| 13 | **Criar Test Execution** — agrupa testes criados em uma execução Xray (usa `inMemoryTasksId` da sessão ou input manual) |

Após a **opção 1**, a ferramenta pergunta se deseja criar um **Test Execution** automaticamente com os testes recém-criados. O Test Execution é uma issue do tipo "Test Execution" que agrupa os testes para execução.

### Comandos Especiais

- `/help` ou `/h` — exibe ajuda contextual
- `/back` ou `/menu` — volta ao menu principal
- Em prompts de entrada (caminho CSV, nome da versão, etc.), `/help` também funciona

### Execução Automática (CI/CD)

```bash
# Pula confirmações e executa a opção do menu automaticamente
AUTO_CONFIRM=true AUTO_CHOICE=1 node jira_management/main.js
```

---

## GitLab Triggers

```bash
node git_triggers/main.js
```

Primeiro seleciona um projeto da lista em `config/projects.json`. O tipo de provedor (GitLab/GitHub) é definido em `config/providers.json`. Provedores GitLab usam `GIT_TOKEN` e `GIT_BASE_URL`; GitHub usa `GITHUB_TOKEN` e `GITHUB_API_URL` (padrão `https://api.github.com`).

### PIPELINES

| Opção | Descrição |
|-------|-----------|
| 1 | **Disparar pipeline** — executa pipeline em branch específica com variáveis customizadas |
| 2 | **Listar schedules** — exibe todos os pipeline schedules do projeto |
| 3 | **Disparar schedule** — executa um schedule específico pelo ID |

### MERGE REQUESTS

| Opção | Descrição |
|-------|-----------|
| 4 | **Criar merge request** — cria MR com revisores opcionais; sem revisores, faz auto-merge após 5s |
| 5 | **Listar MRs aprovados** — exibe MRs com 2+ aprovações |
| 6 | **Fazer merge por ID** — merge de MR específico |
| 7 | **Nivelar branches** — `main → rel_cand → dev` |

### UTILITÁRIOS

| Opção | Descrição |
|-------|-----------|
| 8 | **Exportar variáveis CI/CD** — exibe variáveis do projeto em formato `.env` |
| 9 | **Trocar de projeto** — volta à seleção de projetos |

---

## Formato CSV (Test Creation)

O formato é usado pela opção **1 (Criar testes a partir de CSV)** no Jira Management. O arquivo pode ser gerado manualmente, por script ou por ferramenta externa (Excel, Google Sheets, etc.).

> Um arquivo modelo completo está disponível em [`test_steps_template.csv`](test_steps_template.csv) — copie e edite para começar.

### Especificação Técnica

| Aspecto | Regra |
|---------|-------|
| **Codificação** | UTF-8 (sem BOM) |
| **Line ending** | LF (Unix) ou CRLF (Windows) |
| **Delimitador** | Vírgula (`,`) |
| **Separador de blocos** | `---` em linha isolada |
| **Cabeçalho de steps** | `Action,Data,Expected Result` (exato, primeira linha após metadados) |
| **Parsing de aspas** | Aspas duplas para valores com vírgula; `""` para aspas literais |
| **Colunas faltantes** | Preenchidas com string vazia |

### Anatomia do Arquivo

O arquivo é dividido em **blocos** separados por `---`. Cada bloco representa um caso de teste e contém:

1. **Metadados** (opcionais, exceto `Title:`) — linhas com `Chave: Valor` no início do bloco
2. **Steps** — linhas CSV a partir do cabeçalho `Action,Data,Expected Result`

```
Title: Nome do teste (OBRIGATÓRIO)
Description: "Descrição detalhada (opcional — aspas duplas para multilinha)"
Pre-condition: "Texto livre (opcional — aspas para multilinha)" ou KEY-123
Linked Issues: KEY-100 (tipo), KEY-200 (tipo) (opcional)
Group: NOME-DO-GRUPO (opcional)
---
Action,Data,Expected Result
Ação 1,dado 1,resultado esperado 1
Ação 2,dado 2,resultado esperado 2
```

### Metadados por Bloco

#### `Title:` **(obrigatório)**
```
Title: ECSPOL-TC42 - Verificar login com credenciais válidas
```
- O valor é o texto após `Title:` com espaços removidos
- Bloco sem `Title:` é **ignorado** com warning
- O prefixo do projeto (ex: `ECSPOL-`) é usado para detectar o projeto Jira automaticamente

#### `Description:` **(opcional)**

**Modo aspas (recomendado)** — use `"..."` para delimitar o texto. Multilinha aceito. `""` para aspas literais:
```
Description: "Este teste verifica o fluxo completo
de login do administrador."
```

**Modo range (fallback)** — sem aspas, o texto se estende até o próximo metadado ou `Action,Data`:
```
Description: Este teste verifica o fluxo completo de login
```

#### `Pre-condition:` **(opcional)**

**Modo referência** — chave Jira (`/^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$/`):
```
Pre-condition: ECSPOL-PRE-42
```

**Modo inline** — texto livre (quote mode recomendado para multilinha):
```
Pre-condition: "User must be logged in with admin privileges"
```
O texto é concatenado à descrição do teste no Jira.

#### `Linked Issues:` **(opcional)**
```
Linked Issues: ECSPOL-100 (is tested by), ECSPOL-200 (relates to)
```
Formato: `CHAVE (tipo de link)` separado por vírgula. O tipo de link é resolvido dinamicamente via API (case-insensitive, fallback para `relates to`).

#### `Group:` **(opcional)**
```
Group: LOGIN-FLOW
```
Identificador de grupo para organização dos testes.

### CSV de Steps

A primeira linha após os metadados **deve** ser exatamente:
```
Action,Data,Expected Result
```

| Coluna | Descrição | Obrigatório |
|--------|-----------|-------------|
| `Action` | Ação a ser executada | Sim |
| `Data` | Dados de entrada | Não (vazio se omitido) |
| `Expected Result` | Resultado esperado | Não (vazio se omitido) |

### Exemplo Completo

```
Title: ECSPOL-TC01 - Login com credenciais válidas
Description: "Verifica fluxo feliz de login do administrador"
Pre-condition: "User must be logged out"
Linked Issues: ECSPOL-100 (is tested by)
Group: LOGIN-FLOW
---
Action,Data,Expected Result
Acessar /login,https://app.example.com,Formulário de login exibido
Preencher email,admin@test.com,Campo aceita o valor
Preencher senha,******,Campo aceita o valor
Clicar em Entrar,,Redirecionado para dashboard
```

---

### CSV de Origem Externa

O formato é compatível com exportação de qualquer ferramenta. Abaixo, orientações para geração programática e exportação a partir de planilhas.

#### Geração Programática (Python)

```python
import csv

testes = [
    {
        "title": "TC01 - Login",
        "desc": "Teste de login válido",
        "group": "LOGIN",
        "steps": [
            ("Acessar URL", "https://app.com", "Página carregada"),
            ("Clicar em Entrar", "", "Dashboard exibido"),
        ],
    },
    {
        "title": "TC02 - Login inválido",
        "desc": "Teste de login com senha errada",
        "precondition": "Usuário cadastrado",
        "linked": "KEY-100 (relates to)",
        "group": "LOGIN",
        "steps": [
            ("Acessar URL", "https://app.com", "Página carregada"),
            ("Digitar senha", "wrong", "Mensagem de erro exibida"),
        ],
    },
]

with open("testes.csv", "w", newline="", encoding="utf-8") as f:
    for t in testes:
        f.write(f"Title: {t['title']}\n")
        f.write(f"Description: {t['desc']}\n")
        if "group" in t:
            f.write(f"Group: {t['group']}\n")
        if "precondition" in t:
            f.write(f"Pre-condition: {t['precondition']}\n")
        if "linked" in t:
            f.write(f"Linked Issues: {t['linked']}\n")
        f.write("---\n")
        w = csv.writer(f)
        w.writerow(["Action", "Data", "Expected Result"])
        for step in t["steps"]:
            w.writerow(step)
```

#### Geração Programática (JavaScript/Node.js)

```javascript
const fs = require("fs");
const tests = [
  {
    title: "TC01 - Login",
    steps: [
      ["Acessar URL", "https://app.com", "Página carregada"],
    ],
  },
];
const lines = [];
for (const t of tests) {
  lines.push(`Title: ${t.title}`);
  lines.push("---");
  lines.push("Action,Data,Expected Result");
  for (const s of t.steps) {
    lines.push(s.map(v => (v.includes(",") ? `"${v}"` : v)).join(","));
  }
}
fs.writeFileSync("testes.csv", lines.join("\n"), "utf8");
```

#### Geração Programática (Shell/Bash)

```bash
cat > testes.csv << 'CSV'
Title: TC01 - Login
Description: Teste via script
---
Action,Data,Expected Result
Acessar URL,https://app.com,Página carregada
Clicar em Entrar,,Dashboard
CSV
```

#### Exportação de Planilhas (Excel / Google Sheets / LibreOffice)

1. Crie colunas `Title`, `Description`, `Pre-condition`, `Linked Issues`, `Group`, `---`, `Action`, `Data`, `Expected Result`
2. Preencha os metadados nas primeiras linhas (apenas as colunas desejadas)
3. Separe blocos com `---` em linha própria
4. Exporte como **CSV UTF-8 (delimitado por vírgulas)**

**Atenção:** Ferramentas de planilha podem adicionar BOM ou usar ponto-e-vírgula. Verifique:
- **Excel** salva como `CSV UTF-8 (delimitado por vírgulas)` — compatível
- **Google Sheets** → Arquivo → Download → CSV — compatível
- **LibreOffice** → Salvar como CSV → marque "UTF-8" e vírgula como delimitador

### Armadilhas Comuns

| Situação | Consequência |
|----------|-------------|
| Esquecer `Title:` no bloco | Bloco ignorado com warning |
| `Pre-condition:` com minúscula (`pre-condition:`) | Não reconhecido — vira linha de CSV |
| `---` grudado em texto (`---texto`) | Separador não é detectado |
| Metadado depois do CSV | Vira linha de step indesejado |
| Pre-condition que parece chave Jira mas não é | Se encaixar na regex, será tratado como referência |
| Coluna `Data` com vírgula sem aspas | CSV corrompido — use `"dado, com vírgula"` |
| BOM no início do arquivo (UTF-8 com BOM) | Pode causar parsing incorreto |
| Linha em branco dentro do bloco | Removida antes do parse — seguro |
| `\r` (CR) sem `\n` | Pode quebrar o parse de linhas |
| `Action,Data,Expected Result` com espaços extras | Cabeçalho não detectado |

---

## Variáveis de Ambiente

### Obrigatórias por Contexto

| Variável | Contexto | Descrição | Exemplo |
|----------|----------|-----------|---------|
| `JIRA_BASE_URL` | Jira | URL base do servidor Jira Server | `https://jira.empresa.com` |
| `JIRA_PERSONAL_TOKEN` | Jira | Token de autenticação (Bearer) | `seu-token` |
| `XRAY_BASE_URL` | Xray | URL base do Xray para criação de testes | `https://xray.empresa.com` |
| `GIT_BASE_URL` | GitLab | URL base do servidor GitLab | `https://gitlab.empresa.com` |
| `GIT_TOKEN` | GitLab | Token de autenticação (PRIVATE-TOKEN) | `seu-token` |
| `GITHUB_TOKEN` | GitHub | Token de autenticação (Bearer) para GitHub API | `ghp_xxx` |
| `GITHUB_API_URL` | GitHub | URL da API GitHub (padrão `https://api.github.com`) | `https://api.github.com` |

### Opcionais

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `JIRA_PROJECT` | — | Nome do projeto Jira (pula prompt inicial) |
| `CSV_DEFAULT_PATH` | — | Caminho padrão do CSV na opção 1 |
| `LOG_LEVEL` | `INFO` | Nível mínimo de log (`DEBUG`, `INFO`, `WARN`, `ERROR`) |
| `LOG_FILE` | `false` | Habilita log em arquivo (`true`/`false`) |
| `LOG_DIR` | `logs` | Diretório para arquivos de log |
| `DEBUG` | `false` | Ativa logs de diagnóstico no console (`true`/`false`) |
| `DRY_RUN` | `false` | Simula criação de testes (nenhuma chamada API) (`true`/`false`) |
| `CYPRESS_PROJECT_PATH` | — | Caminho do projeto Cypress externo (gera mapping JSON+MD) |
| `AUTO_CONFIRM` | `false` | Pula confirmações (útil em CI) (`true`/`false`) |
| `AUTO_CHOICE` | — | Pré-seleciona opção do menu na inicialização |

---

## Testes

```bash
npm test               # 168 testes, 14 suites (9 skipped sem .env)
npm run typecheck      # verificação de tipos (0 erros)
```

**14 suites, 159/168 passam** (9 skipped — dependem de `.env` com Jira real + CSV):

| Suite | Testes | O que cobre |
|-------|--------|-------------|
| `logger.test.js` | 17 | Logger root/child, _writeFile, filePath, maskDeep, level filtering |
| `csv_resource.test.js` | 14 | parseDescription (quote+range), parsePrecondition (reference/inline/quoted/null), parseGroup, parseLinkedIssues |
| `jira_resource.test.js` | 8 | JiraResource constructor, JiraLinkManager getIssueLinkTypes (fallback + API), resolveLinkTypeId |
| `jira_validator.test.js` | 14 (9 skip) | Validação local CSV + contra Jira — testes Jira skipped sem credenciais |
| `state.test.js` | 5 | load, save, update, backup recovery |
| `prompt.test.js` | 8 | success/error/warn/info, isQuiet, title, divider, printSummary, ProgressBar |
| `cli_base.test.js` | 4 | mask, validateEnv, setupSigint |
| `http-client.test.js` | 7 | createHttpClient, interceptor, GET/PUT retry 5×, POST/4xx no-retry |
| `csv-import.test.js` | 1 | E2E: CSV import com nock — issues, preconditions, steps, cross-ref |
| `csv-import-errors.test.js` | 7 | E2E: Error paths — POST 500, issueLink 403, linkType 404, precondition 500, PUT 403, steps abort |
| `gitlab_manager.test.js` | 23 | GitLabManager: triggerPipeline, createMergeRequest, getMergeRequest, acceptMergeRequest, getProjectVariables, setVariable, removeVariable, listProjectBranches |
| `nivelar.test.js` | 4 | nivelarBranches: success, one branch fails, both fail, param forwarding |
| `github_manager.test.js` | 30 | GitHubManager: triggerPipeline (auto-detect, workflow_id, no workflows), createPR, getPR, searchPRs, acceptPR, getCICDVariables, _formatPR |
| `create_tests.test.js` | 11 | createTestExecution (7): success, default name, issuetype/field not found, API errors; createTestExecutionWithLinks (4): links all keys, skips already linked, API failure gracefully |
| `testexec.test.js` | 2 | E2E: Test Execution creation com nock — 2 keys, single key default name |

Os testes Jira em `jira_validator.test.js` utilizam as credenciais do `.env` e o CSV em `CSV_DEFAULT_PATH` (padrão: `test_steps.csv`).

Para adicionar testes, crie arquivos `*.test.js` — o Jest os detecta automaticamente.

---

## Fluxos Típicos

### Criar testes do zero

```bash
# 1. Configure o .env
cp .env.example .env
# Edite com suas URLs e tokens

# 2. Crie um CSV de testes
#    Opção A: copie test_steps_template.csv (modelo canônico) e edite
#    Opção B: use o menu → Opção 11 → gera template básico
#    Opção C: exporte de planilha (veja seção abaixo)

# 3. Execute
node jira_management/main.js
# Opção 1 → caminho do CSV → confirma preview → testes criados
```

### Criar release + fechar tarefas

```bash
node jira_management/main.js
# Opção 3 → criar versão
# Opção 4 → atribuir tarefas à versão
# Opção 7 → fechar tarefas (move workflow até Done)
# Opção 8 → publicar versão
```

### Disparar pipeline + merge (multi-provider)

```bash
node git_triggers/main.js
# Opção 1 → disparar pipeline (GitLab) / workflow (GitHub)
# Opção 4 → criar MR (GitLab) / PR (GitHub)
# Opção 7 → nivelar branches main → rel_cand → dev
# Opção 8 → exportar variáveis CI/CD (GitLab) / Actions Variables (GitHub)
```

### Diagnóstico rápido

```bash
node jira_management/main.js
# Opção 12 → testa conexão com Jira API, Xray API e projeto
```

