# QA Tools

Ferramentas internas de automação QA para gerenciamento de releases no Jira/Xray, triggers de pipeline no GitLab e reporting Cypress.

## Setup

```bash
cp .env.example .env   # edite com seus tokens
npm install            # instala dependências
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
│   ├── main.js                # CLI entry point (menu 0-10)
│   ├── jira_resource.js       # Wrapper REST para API Jira Server
│   ├── jira_link_manager.js   # Gerenciamento de link types + pre-conditions
│   ├── csv_resource.js        # Parser de CSV no formato QA Tools
│   ├── package_version_manager.js  # Atualização de package.json + release notes
│   ├── csv_resource.test.js   # Testes do parser CSV
│   └── jira_resource.test.js  # Testes do link manager
├── git_triggers/
│   ├── main.js                # CLI entry point (menu 0-9)
│   └── gitlab_manager.js      # Wrapper REST para API GitLab
└── shared/
    ├── prompt.js              # Helpers de UX (cores, confirmação, erros)
    ├── cli_base.js            # Bootstrap compartilhado (validateEnv, SIGINT, mask)
    └── tls.js                 # Factory de agente HTTPS corporativo
```

---

## Jira Management

```bash
node jira_management/main.js
```

Menu categorizado em **TESTES**, **RELEASES** e **CONFIGURAÇÃO**.

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

### Comandos Especiais

- `/help` ou `/h` — exibe ajuda contextual
- `/back` ou `/menu` — volta ao menu principal
- Em prompts de entrada (caminho CSV, nome da versão, etc.), `/help` também funciona

---

## GitLab Triggers

```bash
node git_triggers/main.js
```

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

O formato é usado pela opção **1 (Criar testes a partir de CSV)** no Jira Management.

### Visão Geral

O arquivo CSV contém **blocos** separados por `---`. Cada bloco representa **um teste** e consiste em:

1. **Metadados**: cabeçalhos opcionais que descrevem o teste
2. **Steps**: dados tabulares com as ações do teste

```
Title: Nome do teste
Description: (opcional) Descrição detalhada
Pre-condition: (opcional) Texto livre ou chave Jira
Linked Issues: (opcional) KEY-123 (tipo), KEY-456 (tipo)
---
Action,Data,Expected Result
Ação do passo 1,dado do passo 1,resultado esperado 1
Ação do passo 2,dado do passo 2,resultado esperado 2
```

### Anatomia de um Bloco

#### Separador `---`
- Deve estar **isolado** em sua própria linha
- Divide os blocos de teste
- Pode haver quantos blocos desejar

#### `Title:` **(obrigatório)**
```
Title: ECSPOL-TC42 - Verificar login com credenciais válidas
```
- Se um bloco não tiver `Title:`, ele é **ignorado** com um warning
- O valor é o texto após `Title:` com espaços removidos

#### `Description:` **(opcional)**
```
Description: Este teste verifica o fluxo completo de login do usuário administrador
```
- Texto livre
- Pode conter `\n` literal para múltiplas linhas (ex: `Line 1\nLine 2`)

#### `Pre-condition:` **(opcional)**

**Modo referência** — se o valor for uma chave Jira válida:
```
Pre-condition: ECSPOL-PRE-42
```
O parser detecta automaticamente pelo padrão: letra maiúscula → alfanumérico → opcional traço + alfanumérico → traço + número.

**Modo inline** — se o valor for texto livre:
```
Pre-condition: User must be logged in with admin privileges
```
O texto é **concatenado à descrição** do teste no Jira (não cria uma issue de pre-condition separada).

#### `Linked Issues:` **(opcional)**
```
Linked Issues: ECSPOL-100 (is tested by), ECSPOL-200 (relates to)
```
Formato: `CHAVE (tipo de link)` separado por vírgula.

O tipo de link é resolvido dinamicamente via API do Jira e pode ser:
- Nome exato do link type: `Tests`, `Relates`, `is tested by`
- Case-insensitive
- Se não encontrar, usa **relates to** como fallback

### CSV de Steps

Após os metadados, as linhas restantes (que não começam com `Title:`, `Description:`, `Pre-condition:` ou `Linked Issues:`) são interpretadas como CSV.

**A primeira linha é o cabeçalho** e DEVE ser exatamente:

```
Action,Data,Expected Result
```

| Coluna | Descrição | Obrigatório |
|--------|-----------|-------------|
| `Action` | Ação a ser executada | Sim |
| `Data` | Dados de entrada | Não (vazio se omitido) |
| `Expected Result` | Resultado esperado | Não (vazio se omitido) |

**Regras do CSV:**
- Delimitador: vírgula (`,`)
- Aspas duplas (`"`) para valores com vírgula interna
- Para aspas literais, duplicar: `"""aspas"""`
- Linhas com colunas a menos são aceitas (colunas faltantes viram string vazia)
- A biblioteca utilizada é `csv-parser@^3.2.0`

### Exemplo Completo (2 testes)

```
Title: ECSPOL-TC01 - Login com credenciais válidas
Description: Verifica fluxo feliz de login do administrador
Pre-condition: User must be logged out
Linked Issues: ECSPOL-100 (is tested by)
---
Action,Data,Expected Result
Acessar /login,https://app.example.com,Formulário de login exibido
Preencher email,admin@test.com,Campo aceita o valor
Preencher senha,******,Campo aceita o valor
Clicar em Entrar,,Redirecionado para dashboard
---
Title: ECSPOL-TC02 - Login com senha inválida
Description: Verifica mensagem de erro ao usar senha incorreta
Pre-condition: ECSPOL-PRE-42
---
Action,Data,Expected Result
Acessar /login,https://app.example.com,Formulário de login exibido
Preencher email,admin@test.com,Campo aceita o valor
Preencher senha,wrong_password,Campo aceita o valor
Clicar em Entrar,,Mensagem "Credenciais inválidas" exibida
```

**Resultado do parse:**

Para o primeiro bloco (`ECSPOL-TC01`):
```javascript
{
  title: 'ECSPOL-TC01 - Login com credenciais válidas',
  description: 'Verifica fluxo feliz de login do administrador',
  precondition: { type: 'inline', value: 'User must be logged out' },
  linkedIssues: [{ key: 'ECSPOL-100', linkType: 'is tested by' }],
  steps: [
    { fields: { Action: 'Acessar /login', Data: 'https://app.example.com', 'Expected Result': 'Formulário de login exibido' } },
    { fields: { Action: 'Preencher email', Data: 'admin@test.com', 'Expected Result': 'Campo aceita o valor' } },
    { fields: { Action: 'Preencher senha', Data: '******', 'Expected Result': 'Campo aceita o valor' } },
    { fields: { Action: 'Clicar em Entrar', Data: '', 'Expected Result': 'Redirecionado para dashboard' } }
  ]
}
```

Para o segundo bloco (`ECSPOL-TC02`):
```javascript
{
  title: 'ECSPOL-TC02 - Login com senha inválida',
  description: 'Verifica mensagem de erro ao usar senha incorreta',
  precondition: { type: 'reference', value: 'ECSPOL-PRE-42' },
  linkedIssues: [],
  steps: [
    { fields: { Action: 'Acessar /login', Data: 'https://app.example.com', 'Expected Result': 'Formulário de login exibido' } },
    { fields: { Action: 'Preencher email', Data: 'admin@test.com', 'Expected Result': 'Campo aceita o valor' } },
    { fields: { Action: 'Preencher senha', Data: 'wrong_password', 'Expected Result': 'Campo aceita o valor' } },
    { fields: { Action: 'Clicar em Entrar', Data: '', 'Expected Result': 'Mensagem "Credenciais inválidas" exibida' } }
  ]
}
```

### Armadilhas Comuns

| Situação | Consequência |
|----------|-------------|
| Esquecer `Title:` no bloco | Bloco ignorado com warning |
| `Pre-condition:` com minúscula ou com espaço extra | Não reconhecido — vira linha de CSV (polui os steps) |
| `---` grudado em texto (`---texto`) | Separador não é detectado |
| Metadado depois do CSV | Vira linha de CSV (step indesejado) |
| Pre-condition que parece chave Jira mas não é | Se encaixar na regex `^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$`, será tratado como referência |
| Coluna `Data` com vírgula sem aspas | CSV corrompido — use `"dado, com vírgula"` |
| Linha em branco dentro do bloco | Linha é removida antes do parse — seguro |

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `JIRA_BASE_URL` | ✅ Jira | URL base do servidor Jira Server | `https://jira.empresa.com` |
| `JIRA_PERSONAL_TOKEN` | ✅ Jira | Token de autenticação (Bearer) | `seu-token` |
| `XRAY_BASE_URL` | ✅ Xray | URL base do Xray para criação de testes | `https://xray.empresa.com` |
| `GIT_BASE_URL` | ✅ GitLab | URL base do servidor GitLab | `https://gitlab.empresa.com` |
| `GIT_TOKEN` | ✅ GitLab | Token de autenticação (PRIVATE-TOKEN) | `seu-token` |
| `CSV_DEFAULT_PATH` | ❌ | Caminho padrão do CSV na opção 1 | `./testes.csv` |
| `DEBUG` | ❌ | Ativa logs de debug (`true`/`false`) | `true` |
| `NODE_TLS_REJECT_UNAUTHORIZED` | ❌ | Desabilita verificação TLS (`0` para desabilitar) | `0` |

**Nota:** `NODE_TLS_REJECT_UNAUTHORIZED=0` é necessário em ambientes corporativos com certificados auto-assinados. Use com cautela.

---

## Testes

```bash
npm test
```

**2 suites, 16 testes:**

| Suite | Testes | O que cobre |
|-------|--------|-------------|
| `csv_resource.test.js` | 8 | `parseDescription`, `parsePrecondition` (reference/inline/null), `parseLinkedIssues` (single/multiple/empty) |
| `jira_resource.test.js` | 8 | `JiraResource` constructor, `JiraLinkManager` getIssueLinkTypes (fallback + API), resolveLinkTypeId (name/inward/case/fallback) |

Para adicionar testes, crie arquivos `*.test.js` no diretório `jira_management/` — o Jest os detecta automaticamente.

---

## Fluxos Típicos

### Criar testes do zero

```bash
# 1. Configure o .env
cp .env.example .env
# Edite com suas URLs e tokens

# 2. Crie um CSV de testes
cat > testes.csv << 'EOF'
Title: ECSPOL-TC01 - Teste de exemplo
Description: Teste criado via CSV
Pre-condition: ECSPOL-PRE-42
---
Action,Data,Expected Result
Passo 1,dado 1,resultado 1
EOF

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
