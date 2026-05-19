# QA Tools

Ferramentas internas de automação QA para gerenciamento de releases no Jira/Xray, triggers de pipeline no GitLab e reporting Cypress.

## Setup

```bash
cp .env.example .env   # edite com seus tokens
npm install            # instala dependências
npm run typecheck      # verifica tipos (opcional, 0 erros esperado)
```

**Pré-requisitos:** Node.js 18+, npm 9+.

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
│   ├── projects.json          # IDs dos projetos GitLab
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
│   └── gitlab_manager.js      # Wrapper REST para API GitLab
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

### UTILITÁRIOS

| Opção | Descrição |
|-------|-----------|
| 11 | **Gerar template CSV** — cria arquivo `test_steps_template.csv` com exemplo didático |
| 12 | **Diagnosticar conexão** — testa conectividade com Jira API, Xray API e projeto |

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

Primeiro seleciona um projeto da lista em `config/projects.json`, depois apresenta o menu de ações.

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
| 7 | **Nivelar branches** — `main → rel_cand → dev` com espera de 10s entre merges |

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
Description: Descrição detalhada (opcional)
Pre-condition: Texto livre ou chave Jira (opcional)
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
```
Description: Este teste verifica o fluxo completo de login
```
- Texto livre
- `\n` literal para múltiplas linhas

#### `Pre-condition:` **(opcional)**

**Modo referência** — se o valor for uma chave Jira (`/^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$/`):
```
Pre-condition: ECSPOL-PRE-42
```

**Modo inline** — se for texto livre:
```
Pre-condition: User must be logged in with admin privileges
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
Description: Verifica fluxo feliz de login do administrador
Pre-condition: User must be logged out
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

### Opcionais

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `JIRA_PROJECT` | — | Nome do projeto Jira (pula prompt inicial) |
| `CSV_DEFAULT_PATH` | — | Caminho padrão do CSV na opção 1 |
| `LOG_LEVEL` | `INFO` | Nível mínimo de log (`DEBUG`, `INFO`, `WARN`, `ERROR`) |
| `LOG_FILE` | `false` | Habilita log em arquivo (`true`/`false`) |
| `LOG_DIR` | `logs` | Diretório para arquivos de log |
| `DEBUG` | `false` | Ativa logs de diagnóstico no console (`true`/`false`) |
| `AUTO_CONFIRM` | `false` | Pula confirmações (útil em CI) (`true`/`false`) |
| `AUTO_CHOICE` | — | Pré-seleciona opção do menu na inicialização |

---

## Testes

```bash
npm test               # 94 testes, 10 suites
npm run typecheck      # verificação de tipos (0 erros)
```

**10 suites, 94 testes** (~5s):

| Suite | Testes | O que cobre |
|-------|--------|-------------|
| `logger.test.js` | 17 | Logger root/child, _writeFile, filePath, maskDeep, level filtering |
| `csv_resource.test.js` | 14 | parseDescription, parsePrecondition (reference/inline/null/key+desc), parseGroup, parseLinkedIssues (single/multiple/empty) |
| `jira_resource.test.js` | 8 | JiraResource constructor, JiraLinkManager getIssueLinkTypes (fallback + API), resolveLinkTypeId (name/inward/case/fallback) |
| `jira_validator.test.js` | 14 | Validação local de CSV + validação contra Jira — testes Jira são skipped sem credenciais |
| `state.test.js` | 5 | load (vazio/existente), save, update, backup recovery |
| `prompt.test.js` | 8 | success/error/warn/info, isQuiet, title, divider, printSummary, ProgressBar |
| `cli_base.test.js` | 4 | mask, validateEnv (missing + placeholder detection), setupSigint |
| `http-client.test.js` | 7 | createHttpClient config, interceptor registration, GET retry 5×, PUT retry 5×, POST no-retry, 4xx no-retry |
| `csv-import.test.js` | 1 | E2E: CSV import com nock — 2 issues, preconditions, steps, linked issues, cross-ref |
| `csv-import-errors.test.js` | 7 | E2E: Error paths — POST 500 (skip/abort), issueLink 403, linkType 404, precondition 500, PUT 403, steps abort |

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

### Disparar pipeline + merge

```bash
node git_triggers/main.js
# Opção 1 → disparar pipeline em branch
# Opção 4 → criar MR com revisores
# Opção 7 → nivelar branches main → rel_cand → dev
```

### Diagnóstico rápido

```bash
node jira_management/main.js
# Opção 12 → testa conexão com Jira API, Xray API e projeto
```

