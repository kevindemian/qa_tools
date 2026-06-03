# Gerenciamento Jira — QA Tools

> Ferramenta de linha de comando para gerenciar testes, versões e releases no Jira/Xray.
> Projeto ativo: `ECSPOL` (configurável via opção 9).

---

## Índice

- [Menu completo](#menu-completo)
- [1 — Criar testes a partir de CSV](#1--criar-testes-a-partir-de-csv)
- [2 — Listar versões de release](#2--listar-versões-de-release)
- [3 — Criar nova versão](#3--criar-nova-versão)
- [4 — Atribuir fixVersion às tarefas](#4--atribuir-fixversion-às-tarefas)
- [5 — Atualizar package.json + release notes](#5--atualizar-packagejson--release-notes)
- [6 — Verificar status das tarefas](#6--verificar-status-das-tarefas)
- [7 — Fechar tarefas automaticamente](#7--fechar-tarefas-automaticamente)
- [8 — Publicar versão](#8--publicar-versão)
- [9 — Alterar projeto Jira](#9--alterar-projeto-jira)
- [10 — Alterar diretório git](#10--alterar-diretório-git)
- [11 — Gerar template CSV/JSON](#11--gerar-template-csvjson)
- [12 — Diagnosticar conexão](#12--diagnosticar-conexão)
- [13 — Criar Test Execution](#13--criar-test-execution)
- [14 — Alterar diretório Cypress](#14--alterar-diretório-cypress)
- [15 — Importar testes de JSON](#15--importar-testes-de-json)
- [16 — Alterar diretório JSON](#16--alterar-diretório-json)
- [17 — Gerar relatório HTML + análise IA](#17--gerar-relatório-html--análise-ia)
- [18 — Gerar testes de user story (IA)](#18--gerar-testes-de-user-story-ia)
- [19 — Histórico / Cobertura](#19--histórico--cobertura)
- [20 — Criar Bug Report](#20--criar-bug-report)
- [21 — Análise de gaps de cobertura](#21--análise-de-gaps-de-cobertura)
- [22 — Impacto de mudanças (test impact)](#22--impacto-de-mudanças-test-impact)
- [23 — Feedback de IA](#23--feedback-de-ia)

---

## Menu completo

O menu é organizado em categorias com sub-menus:

| Categoria                 | Opções                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GERAÇÃO DE RELATÓRIOS     | 17 — Gerar relatório HTML                                                                                                                                |
| GERAÇÃO DE CASOS DE TESTE | 1 — Criar testes a partir de CSV, 11 — Gerar template, 13 — Criar Test Execution, 15 — Importar JSON, 18 — Gerar testes via IA                           |
| BUG REPORT                | 20 — Criar Bug Report                                                                                                                                    |
| ANÁLISE E HISTÓRICO       | 19 — Histórico / Cobertura, 21 — Gaps de cobertura, 22 — Test impact, 23 — Feedback de IA, 24 — Setup wizard CI/CD                                       |
| RELEASES                  | 2 — Listar versões, 3 — Criar versão, 4 — Atribuir fixVersion, 5 — Atualizar package.json, 6 — Verificar status, 7 — Fechar tarefas, 8 — Publicar versão |
| CONFIGURAÇÃO              | 9 — Alterar projeto, 10 — Alterar diretório git, 12 — Diagnosticar conexão, 14 — Alterar Cypress, 16 — Alterar JSON                                      |
| SETUP CI/CD               | 24 — Setup wizard CI/CD                                                                                                                                  |
| UTILITÁRIOS               | d — Ver documentação                                                                                                                                     |

**Aliases disponíveis:** `criar` (1), `versoes` (2), `fechar` (7), `publicar` (8), `template` (11), `testexec` (13), `json` (15), `bug` (20), `gaps` ou `gap-analysis` (21), `impacto` ou `test-impact` (22), `ai-feedback` ou `feedback` (23), `docs` (d), entre outros.

---

### 1 — Criar testes a partir de CSV

Cria issues do tipo "Test" no Jira com steps, pre-conditions e linked issues a partir de um arquivo CSV. Suporta blocos separados por `---`, preview interativo com filtro por título, DRY-RUN, checkpoint com resume em caso de falha, e geração opcional de Test Execution.

**Fluxo:**

1. Usuário informa o caminho do CSV e labels Jira (opcionais, separadas por vírgula).
2. `csv_resource.ts` faz o parsing do CSV: lê blocos delimitados por `---`, extrai metadados (`Title`, `Description`, `Pre-condition`, `Linked Issues`, `Group`) e steps (`Action`, `Data`, `Expected Result`).
3. `TestCaseValidator` valida a estrutura de cada `TestCase`.
4. Exibe preview dos testes encontrados; usuário pode filtrar por título e confirmar a criação.
5. Para cada teste, o fluxo é:
    - `TestCaseFactory.createIssue()` → POST `/issue` no Jira (tipo "Test").
    - `TestCaseFactory.postSteps()` → POST steps no Xray via API.
    - `IssueLinker.associatePrecondition()` → vincula pre-condition (referência `KEY-123` ou texto inline).
    - `IssueLinker.linkIssues()` → cria linked issues conforme `Linked Issues` do CSV.
    - Atualiza cross-references entre testes do mesmo `Group`.
    - `MappingFileGenerator` gera arquivos de mapeamento (JSON, MD, TXT).
6. Ao final, pergunta se deseja criar um Test Execution com os testes criados.

**Arquivos relacionados:**

- `commands/case01.ts` — handler da opção
- `create_tests.ts` — orquestração central (função `createTestsFromCsv`)
- `csv_resource.ts` — parsing do CSV em blocos
- `csv-import-schema.ts` — validação Zod dos `TestCase`
- `test-case-factory.ts` — criação de issues e steps no Jira/Xray
- `issue-linker.ts` — associação de pre-conditions e linked issues
- `mapping-file-generator.ts` — geração de arquivos de mapeamento
- `test-execution-creator.ts` — criação opcional de Test Execution
- `commands/helpers.ts` — wrapper `createTestExecutionWithLinksWrapper`

---

### 2 — Listar versões de release

Busca e exibe todas as versões (released e unreleased) do projeto Jira ativo, com indicação de atraso para versões não lançadas cuja data já passou.

**Fluxo:**

1. Obtém `projectId` via `jiraResource.getProjectId()`.
2. Chama `jiraResource.getProjectVersions(projectId)` → GET `/project/{id}/versions`.
3. Itera sobre os resultados exibindo nome, descrição, status (RELEASED ou não) e, se aplicável, indicador de atraso.

**Arquivos relacionados:**

- `commands/case02.ts` — handler da opção
- `jira_resource.ts` — métodos `getProjectId` e `getProjectVersions`

---

### 3 — Criar nova versão

Cria uma nova versão unreleased no projeto Jira ativo.

**Fluxo:**

1. Usuário informa nome e descrição da versão.
2. `jiraResource.createVersion()`:
    - Verifica se já existe via `getVersionId()`.
    - Se existir, informa e aborta.
    - Se não, faz POST `/version` com `{ name, description, project, released: false }`.

**Arquivos relacionados:**

- `commands/case03.ts` — handler da opção
- `jira_resource.ts` — métodos `getVersionId` e `createVersion`

---

### 4 — Atribuir fixVersion às tarefas

Atribui uma versão (fixVersion) a tarefas existentes, com opção de adicionar a uma sprint.

**Fluxo:**

1. Pergunta se deseja usar tarefas criadas anteriormente na sessão (in-memory) ou digitar IDs manualmente.
2. Usuário informa o nome da versão.
3. Exibe preview da operação (versão + lista de tarefas) e solicita confirmação.
4. Para cada taskId, chama `jiraResource.updateFixVersions()`:
    - Resolve versionId.
    - Faz PUT `/issue/{taskId}` com `{ update: { fixVersions: [{ set: [{ id }] }] } }`.
5. Exibe sumário com resultados (ok/erro por tarefa).
6. Pergunta se deseja adicionar as tarefas a uma sprint; se sim, faz POST `/sprint/{id}/issue`.

**Arquivos relacionados:**

- `commands/case04.ts` — handler da opção
- `jira_resource.ts` — método `updateFixVersions`

---

### 5 — Atualizar package.json + release notes

Busca tarefas de uma versão específica, atualiza a versão no `package.json` e insere as tasks no início do arquivo `release_notes/ReleaseNotes.txt`.

**Fluxo:**

1. Se `packageManager` não estiver configurado na sessão, pergunta o diretório git (instancia `PackageVersionManager`).
2. Usuário informa o nome da versão.
3. `jiraResource.getReleaseTasks(project, version, testOnly=true)` → busca issues tipo "Test" com a fixVersion.
4. Extrai o número da versão (ex: `v2.7.0` → `2.7.0`).
5. `packageManager.updateReleaseNotes(versionNumber, tasks)`:
    - Lê `release_notes/ReleaseNotes.txt`.
    - Insere novo bloco no topo com as tasks formatadas como `[KEY-123] - Summary`.
6. `packageManager.updateVersion(pkgVersion)`:
    - Lê `package.json`, atualiza o campo `version`, salva.

**Arquivos relacionados:**

- `commands/case05.ts` — handler da opção
- `package_version_manager.ts` — atualização de `package.json` e release notes
- `jira_resource.ts` — método `getReleaseTasks`

---

### 6 — Verificar status das tarefas

Verifica se todas as tarefas de uma determinada versão estão com status "Done" ou "In Use".

**Fluxo:**

1. Usuário informa o nome da versão.
2. `jiraResource.checkReleaseTasksStatus()`:
    - Monta JQL: `project = {projectId} AND fixVersion = "{version}"`.
    - Itera sobre as issues encontradas.
    - Para cada issue, verifica se `status` é "done" ou "in use".
    - Exibe quais estão concluídas e quais não.

**Arquivos relacionados:**

- `commands/case06.ts` — handler da opção
- `jira_resource.ts` — método `checkReleaseTasksStatus`

---

### 7 — Fechar tarefas automaticamente

Move todas as tarefas de uma versão através do workflow Jira até o status "Done". Segue o fluxo: New → Approve → Coding In Progress → Coding Done → Done.

**Fluxo:**

1. Usuário informa a versão e confirma a operação (com aviso de irreversibilidade).
2. `jiraResource.getReleaseTasks()` → busca issues da versão.
3. Extrai keys no formato `KEY-123` de cada task.
4. `jiraResource.moveCardsToDone(taskIds)`:
    - Para cada task, obtém o status atual e as transições disponíveis via GET `/issue/{key}/transitions`.
    - Aplica transições seguindo o `workflowMap` (`new → approve`, `approve → use test case`, `coding in progress → coding done`, `coding done → done`) até atingir o status "Done".
5. Exibe sumário com resultado por tarefa.

**Arquivos relacionados:**

- `commands/case07.ts` — handler da opção
- `jira_resource.ts` — métodos `getReleaseTasks`, `getTransitionsForIssue`, `moveCardsToDone`

---

### 8 — Publicar versão

Marca uma versão como released no Jira. Valida que todas as tarefas estão concluídas antes de publicar.

**Fluxo:**

1. Usuário informa a versão e confirma.
2. `jiraResource.releaseVersion()`:
    - Verifica se a versão existe via `getVersionId()`.
    - Verifica se todas as tarefas estão concluídas via `checkReleaseTasksStatus()`.
    - Se alguma tarefa não estiver concluída, exibe aviso e aborta.
    - Faz PUT `/version/{id}` com `{ releaseDate: hoje, released: true }`.

**Arquivos relacionados:**

- `commands/case08.ts` — handler da opção
- `jira_resource.ts` — método `releaseVersion`

---

### 9 — Alterar projeto Jira

Troca o projeto Jira ativo na sessão atual. O nome é persistido em `state.lastProject`.

**Fluxo:**

1. Usuário informa o novo nome do projeto (ex: `PROJ`).
2. Atualiza `ctx.project_name` e persiste em `state.lastProject`.
3. O menu passa a exibir o novo projeto.

**Arquivos relacionados:**

- `commands/case09.ts` — handler da opção
- `shared/state.ts` — persistência do projeto

---

### 10 — Alterar diretório git

Define o diretório do projeto git usado pela opção 5 para atualizar `package.json` e release notes.

**Fluxo:**

1. Usuário informa o caminho do diretório git.
2. Instancia `PackageVersionManager` com o caminho informado.
3. Guarda em `ctx.packageManager` e `ctx.git_directory`.

**Arquivos relacionados:**

- `commands/case10.ts` — handler da opção
- `package_version_manager.ts` — instanciado com o diretório

---

### 11 — Gerar template CSV/JSON

Copia o arquivo `test_steps_template.csv` ou gera um JSON de exemplo (modelo canônico com exemplos de todos os campos e formatos) para o caminho informado pelo usuário.

**Fluxo:**

1. Usuário informa o caminho de destino.
2. Copia o arquivo via `fs.copyFileSync()` da origem (`jira_management/test_steps_template.csv`).

**Arquivos relacionados:**

- `commands/case11.ts` — handler da opção
- `test_steps_template.csv` — arquivo template (localizado na raiz do projeto)

---

### 12 — Diagnosticar conexão

Testa a conectividade com três endpoints: Jira API (autenticação), Xray API e endpoint do projeto ativo.

**Fluxo:**

1. Testa 3 endpoints sequencialmente:
    - `GET /rest/api/2/myself` (Jira API — valida token).
    - `GET {base_url}` (Xray API — endpoint base).
    - `GET /rest/api/2/project/{project}` (projeto atual).
2. Para cada endpoint, mede o tempo de resposta em ms e exibe o status HTTP.
3. Detecta 401/403 como token inválido.
4. Exibe sumário (quantos ok/erro).

**Arquivos relacionados:**

- `commands/case12.ts` — handler da opção
- `jira_resource.ts` — usa `axiosInstance` do resource

---

### 13 — Criar Test Execution

Cria uma issue do tipo "Test Execution" no Jira, vinculando testes existentes via custom field do Xray e links do tipo "Tests".

**Fluxo:**

1. Se há testes criados na sessão atual (in-memory), pergunta se deseja usá-los.
2. Caso contrário, usuário digita as keys manualmente (ex: `TEST-1 TEST-2`).
3. Usuário informa nome da execução, título e descrição do Test Execution.
4. `createTestExecutionWithLinks()` → `TestExecutionCreator.createWithLinks()`:
    - Descobre o issue type "Test Execution" no projeto.
    - Descobre o custom field `com.xpandit.plugins.xray:testexec-tests-custom-field`.
    - POST `/issue` com os testKeys no campo customizado.
    - Para cada testKey, cria link do tipo "Tests" para o Test Execution.

**Arquivos relacionados:**

- `commands/case13.ts` — handler da opção
- `commands/helpers.ts` — wrapper `createTestExecutionWithLinksWrapper`
- `create_tests.ts` — função `createTestExecutionWithLinks`
- `test-execution-creator.ts` — criação da issue e links

---

### 14 — Alterar diretório Cypress

Define o diretório do projeto Cypress, usado pelo `MappingFileGenerator` e `Config.cypressProjectPath` para localizar arquivos de mapping.

**Fluxo:**

1. Usuário informa o caminho do diretório Cypress.
2. Resolve o caminho absoluto via `path.resolve()`.
3. Persiste em `state.lastCypressPath`.

**Arquivos relacionados:**

- `commands/case14.ts` — handler da opção
- `shared/state.ts` — persistência do caminho

---

### 15 — Importar testes de JSON

Cria issues do tipo "Test" no Jira a partir de um arquivo JSON (ou TXT com formato JSON). Compartilha ~90% do código com a opção 1 (CSV), diferindo apenas na fonte dos dados.

**Fluxo:**

1. Usuário informa o caminho do arquivo JSON; se o diretório JSON padrão estiver configurado (opção 16), resolve caminhos relativos.
2. `createTestsFromJson()` em `create_tests.ts`:
    - Lê e faz parse do JSON (array de objetos com `title`, `description`, `steps`, `precondition`, `group`, `linkedIssues`).
    - Converte para `TestCase[]` e chama `_createTestsFromTestCases()` — mesma lógica da opção 1.
    - Suporta checkpoint/resume e DRY-RUN.
3. Ao final, pergunta se deseja criar um Test Execution.

**Arquivos relacionados:**

- `commands/case15.ts` — handler da opção
- `create_tests.ts` — função `createTestsFromJson` e `_createTestsFromTestCases`
- `test-case-factory.ts`, `issue-linker.ts`, `test-case-validator.ts`, `mapping-file-generator.ts` — mesmos da opção 1

---

### 16 — Alterar diretório JSON

Define o diretório padrão para arquivos JSON usados na opção 15. Permite usar caminhos relativos na importação.

**Fluxo:**

1. Usuário informa o caminho do diretório.
2. Resolve o caminho absoluto via `path.resolve()`.
3. Persiste em `state.lastJsonDir`.

**Arquivos relacionados:**

- `commands/case16.ts` — handler da opção
- `shared/state.ts` — persistência do caminho

---

## Variáveis de ambiente

| Variável               | Descrição                                               | Obrigatória |
| ---------------------- | ------------------------------------------------------- | ----------- |
| `JIRA_BASE_URL`        | URL base do Jira (ex: `https://seu-jira-server`)        | Sim         |
| `JIRA_PERSONAL_TOKEN`  | Token de autenticação Bearer                            | Sim         |
| `XRAY_BASE_URL`        | URL base do Xray (necessária para criar testes)         | Sim         |
| `XRAY_MODE`            | Modo Xray: `server` (API REST) ou `cloud` (API GraphQL) | Não         |
| `XRAY_CLIENT_ID`       | Client ID Xray Cloud (modo `cloud`)                     | Não         |
| `XRAY_CLIENT_SECRET`   | Client Secret Xray Cloud                                | Não         |
| `XRAY_CLOUD_URL`       | Override da URL base da API Xray Cloud                  | Não         |
| `JIRA_PROJECT`         | Projeto Jira padrão (opcional, fallback `ECSPOL`)       | Não         |
| `CSV_DEFAULT_PATH`     | Caminho padrão do CSV                                   | Não         |
| `CSV_PATH`             | Sobrescreve caminho CSV                                 | Não         |
| `CSV_LABELS`           | Labels padrão separadas por vírgula                     | Não         |
| `JSON_PATH`            | Caminho padrão para JSON                                | Não         |
| `JSON_LABELS`          | Labels para import JSON                                 | Não         |
| `CYPRESS_PROJECT_PATH` | Diretório do projeto Cypress                            | Não         |
| `AUTO_CHOICE`          | Opção automática do menu (para scripting)               | Não         |
| `AUTO_CONFIRM`         | Pular confirmações (true/false)                         | Não         |
| `DRY_RUN`              | Simular requisições sem executar                        | Não         |
| `QUIET`                | Suprimir output informativo                             | Não         |
| `ON_ERROR`             | Ação em erro: `abort` ou `skip`                         | Não         |
| `XDG_STATE_HOME`       | Diretório de estado persistente                         | Não         |
| `QA_TOOLS_TEMP_DIR`    | Diretório temporário (previews, cache, docs HTML)       | Não         |
| `QA_TOOLS_REPORTS_DIR` | Diretório de relatórios gerados (HTML, flakiness)       | Não         |
| `QA_TOOLS_LOGS_DIR`    | Sobrescreve `LOG_DIR` (maior prioridade)                | Não         |
| `DEBUG`                | Modo debug com logging adicional                        | Não         |
| `LLM_API_KEY`          | API key do provedor LLM **main**                        | Condicional |

---

## Formato do CSV (opção 1)

Cada teste é um bloco separado por `---` em linha isolada. Metadados vêm antes do cabeçalho de steps.

```
Title: Nome do teste
Description: Descrição opcional
Pre-condition: KEY-123 ou "texto inline"
Linked Issues: KEY-100 (is tested by), KEY-200 (relates to)
Group: NOME-DO-GRUPO
Action,Data,Expected Result
Step 1 action,step 1 data,step 1 expected
Step 2 action,step 2 data,step 2 expected
---
Title: Outro teste
Action,Data,Expected Result
Step 1 action,step 1 data,step 1 expected
```

**Campos:**

- `Title` — **obrigatório**. Nome do teste.
- `Description` — opcional. Suporta multilinha entre aspas duplas.
- `Pre-condition` — opcional. Pode ser referência a uma issue (`KEY-123`) ou texto inline entre aspas.
- `Linked Issues` — opcional. Formato: `KEY (relation)`. Relações comuns: `is tested by`, `relates to`.
- `Group` — opcional. Agrupa testes para cross-reference automática.
- `Action`, `Data`, `Expected Result` — steps do teste.

## Formato JSON (opção 15)

```json
[
    {
        "title": "Nome do teste",
        "description": "Descrição opcional",
        "steps": [{ "Action": "Ação", "Data": "Dado", "ExpectedResult": "Resultado esperado" }],
        "precondition": "KEY-123 ou texto",
        "group": "GRUPO",
        "linkedIssues": ["KEY-100 (is tested by)"]
    }
]
```

---

## Fluxo de release recomendado

1. **Opção 11** — Gere o template CSV/JSON como base.
2. **Opção 1** — Crie os testes no Jira a partir do CSV.
3. **Opção 3** — Crie a versão da release.
4. **Opção 4** — Atribua a versão às tarefas.
5. **Opção 5** — Atualize package.json e release notes.
6. **Opção 6** — Verifique o status das tarefas.
7. **Opção 7** — Feche as tarefas automaticamente.
8. **Opção 8** — Publique a versão.

---

## 17 — Gerar relatório HTML + análise IA

> O relatório HTML é gerado **mesmo sem análise IA**. A IA é um enriquecimento opcional — stats, gráfico e tabela funcionam independentemente.

Gera um relatório HTML interativo a partir de um arquivo JSON (formato **CTRF** ou **Mochawesome**) e, opcionalmente, enriquece com análise de falhas por IA. Também pode gerar um **Bug Report** no Jira ao final.

### Fluxo

1. Informa o caminho do JSON (CTRF ou Mochawesome)
2. Parseia com `result_parser.ts` — extrai `title`, `state`, `duration`
3. Busca **histórico Git** das últimas 5 execuções via API (GitHub Actions `/actions/runs` ou GitLab CI `/pipelines`), extrai CTRF de artifacts ZIPados
4. Gera HTML com `generateHtmlReport()` incluindo:
    - Estatísticas (passados, falhas, skipped, duração total)
    - Tabela de testes com cores por status (com **filtro JS** e **export CSV**)
    - Gráfico SVG de distribuição + **gráfico de tendência** (pass rate dos últimos runs)
    - **Dark mode** automático (segue `prefers-color-scheme`)
    - **Detecção de flaky tests** entre execuções
    - **Commits recentes** em `<details>`
    - **Contexto Jira**: busca issues tipo Bug com `summary~"<test_name>"` para testes falhos
    - **Diff vs última execução** (`last-results.ctrf.json`): novas falhas/passes destacados
    - **Categorização de falhas**: ASSERTION, TIMEOUT, ENVIRONMENT, APPLICATION, FLAKY, UNKNOWN (badge colorido)
    - **Footer** com CI URL, branch, job name
5. Se houver testes falhos, pergunta: _"Deseja analisar falhas com IA?"_
    - Se sim, chama `analyzeFailuresWithReport()` com **contexto enriquecido** (gitCommits, gitTrend, jiraIssues)
    - Pipeline LLM (report → validate → retry → reviewer → fallback)
    - Insere seção "Análise IA" no HTML com badge de confiança (🟢 alta / 🟡 média / 🔴 baixa)
    - Se fallback ativo, exibe ⚠ warning no relatório
6. **Quality Gate**: se `QA_FAIL_ON=<rate>`, valida pass rate mínimo. Abaixo do threshold → reporta erro.
7. **Auto-bug**: se `QA_AUTO_BUG=true`, cria automaticamente Bug no Jira para cada nova falha detectada no diff
8. **PR Comment**: se `GITHUB_PR_NUMBER` configurado, posta resumo dos testes como comentário no PR
9. Salva HTML + `report.ctrf.json` + `report.stats.json` + `last-results.ctrf.json` no diretório de saída
10. Abre o HTML no navegador via `openWithOsOrFallback()`
11. Se houver falhas, pergunta se deseja criar **Bug Report** no Jira (chama `interactiveBugReportFlow()`)

**Arquivo:** `jira_management/commands/case17.ts`

---

## 18 — Gerar testes de user story (IA)

> ⚠ Funcionalidade **exclusivamente baseada em IA**. Requer `LLM_FAST_API_KEY` configurada (tier **fast** — Groq) ou fallback para **main**. Sem LLM, a operação é cancelada com mensagem de erro.

Cria casos de teste automaticamente a partir de uma história de usuário e critérios de aceitação usando IA.

### Fluxo

1. Informa o título da história
2. Informa a descrição / user story
3. Informa os critérios de aceitação
4. A IA (tier **main**) gera um JSON com:
    - `title` — nome do teste
    - `steps` — array de `{ action, data, expectedResult }`
5. Exibe preview dos testes gerados
6. Confirma antes de criar no Jira via API

**Prompt template:** `shared/prompts/user-story-to-tests.md`

**Arquivo:** `jira_management/commands/case18.ts`

---

## 19 — Histórico / Cobertura

> Histórico de execuções, análise de flakiness, tendências e cobertura Jira funcionam **sem LLM**. A comparação narrativa com IA é um adicional — se o LLM falhar, a seção é omitida silenciosamente e as demais funcionalidades permanecem intactas.

Menu de dois sub-comandos: **(a)** Mostrar histórico de execuções, **(b)** Analisar cobertura Jira.

### (a) Histórico de execuções

1. Carrega as últimas execuções armazenadas em `metrics.json`
2. Exibe tabela com pass rate, total de testes e falhas dos últimos 10 runs
3. `calculateFlakiness()` — detecta testes com estados mistos (passed↔failed entre runs)
4. Quando há 2+ execuções, opcionalmente compara via `compareRuns()` (tier **fast**):
    - Variação de pass rate
    - Novas falhas introduzidas
    - Tendência geral (melhora, piora, estável)
5. Exibe análise textual de 3–5 sentenças

### (b) Cobertura Jira

1. `analyzeCoverage()` — busca issues tipo Test via JQL
2. Verifica se cada issue tem steps (campo `steps` com length > 0)
3. Agrupa gaps por Epic (`customfield_10014`)
4. Exibe `CoverageResult` com:
    - `totalIssues`, `totalSteps`, `mappedIssues`
    - `unmappedSteps` — issues sem steps
    - `gapsByEpic` — gaps agrupados por épico
    - `coveragePct` — percentual geral
5. `saveCoverageSnapshot()` — persiste timestamp + métricas em `metrics.json`

**Arquivos:** `jira_management/commands/case19.ts`, `jira_management/coverage.ts`

---

## 20 — Criar Bug Report

Cria um Bug Report no Jira descrevendo falhas encontradas em uma execução de testes. O usuário informa manualmente os detalhes ou os dados são reaproveitados do fluxo da opção 17.

### Fluxo (manual)

1. Informa o título do bug
2. Informa a descrição detalhada
3. Informa os passos para reproduzir (multilinha, finaliza com Enter duas vezes)
4. Informa o ambiente (ex: `staging`, `production`)
5. Informa a severidade (`high`, `medium`, `low`)
6. Informa os links dos testes falhos (opcional)
7. A issue é criada via `JiraResource.createIssue()` com type "Bug"
8. Se houver links de testes falhos, cria linked issues via `JiraLinkManager`

### Fluxo (automático, via opção 17)

Após gerar relatório HTML com falhas, a opção 17 pergunta: _"Deseja criar um relatório de bug (Bug Report) no Jira para as falhas?"_. Os dados das falhas são extraídos automaticamente via `collectAutomated()` e o fluxo interativo é pré-preenchido.

### Arquivos relacionados

- `commands/case20.ts` — handler da opção
- `shared/bug-report.ts` — funções `collectManual`, `collectAutomated`, `interactiveBugReportFlow`

---

## Aliases do menu

Todos os comandos podem ser acionados por alias textual (em vez do número):

| Alias(es)                                     | Resolve para | Operação                         |
| --------------------------------------------- | ------------ | -------------------------------- |
| `sair`, `exit`                                | `0`          | Sair                             |
| `criar`, `criar-teste`, `criar-testes`, `t`   | `1`          | Criar testes a partir de CSV     |
| `listar-versoes`, `versoes`, `r`              | `2`          | Listar versões                   |
| `criar-versao`                                | `3`          | Criar nova versão                |
| `atribuir-fixversion`, `fixversion`           | `4`          | Atribuir fixVersion              |
| `atualizar-package`, `package`                | `5`          | Atualizar package.json           |
| `verificar`, `status`                         | `6`          | Verificar status                 |
| `fechar`                                      | `7`          | Fechar tarefas                   |
| `publicar`, `release`                         | `8`          | Publicar versão                  |
| `trocar-projeto`, `projeto`, `c`              | `9`          | Alterar projeto Jira             |
| `trocar-diretorio`, `diretorio`               | `10`         | Alterar diretório git            |
| `template`, `gerar-template`, `u`             | `11`         | Gerar template CSV/JSON          |
| _(sem alias)_                                 | `12`         | Diagnosticar conexão             |
| `testexec`, `criar-testexec`, `execucao`      | `13`         | Criar Test Execution             |
| `diretorio-cypress`, `cypress`                | `14`         | Alterar diretório Cypress        |
| `importar-json`, `json`                       | `15`         | Importar testes de JSON          |
| `diretorio-json`                              | `16`         | Alterar diretório JSON           |
| `relatorio`, `html`                           | `17`         | Gerar relatório HTML             |
| `us`, `estoria`, `historia`                   | `18`         | Gerar testes via User Story (IA) |
| `cobertura`                                   | `19`         | Histórico / Cobertura            |
| `bug`, `bug-report`, `bugreport`, `criar-bug` | `20`         | Criar Bug Report                 |
| `gap-analysis`, `gaps`                        | `21`         | Análise de gaps de cobertura     |
| `test-impact`, `impacto`                      | `22`         | Impacto de mudanças              |
| `ai-feedback`, `feedback`                     | `23`         | Feedback de IA                   |
| `setup-wizard`, `setup`                       | `24`         | Setup wizard CI/CD               |
| `d`, `documentacao`, `docs`                   | `docs`       | Ver documentação                 |
| `voltar`                                      | `/menu`      | Voltar ao menu principal         |
| `ajuda`, `help`                               | `/help`      | Ajuda                            |

---

## Comandos especiais

Durante qualquer prompt de texto (não só no menu), os seguintes comandos `/` estão disponíveis:

| Comando                   | Descrição                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `/help` ou `/h`           | Exibe ajuda contextual geral com tópicos disponíveis                                         |
| `/help <tópico>`          | Ajuda sobre um tópico específico (`csv`, `labels`, `group`, `precondition`, `project`, etc.) |
| `/help search <termo>`    | Busca termo em todos os tópicos de ajuda                                                     |
| `/home`                   | Exibe splash screen e retorna ao menu principal                                              |
| `/back` ou `/menu`        | Volta ao menu principal (se em sub-menu) ou sai da aplicação (se no nível principal)         |
| `/docs` ou `/d`           | Abre a documentação completa no navegador (converte Markdown → HTML em lote)                 |
| `/history`                | Mostra tabela com as últimas 10 operações registradas                                        |
| `/exit`, `/sair`, `/quit` | Encerra a sessão                                                                             |

---

## Histórico de operações

Todas as operações são registradas em `~/.local/state/qa_tools_state.json` com timestamp, operação, detalhe e status. As últimas 50 operações ficam disponíveis. O menu exibe contadores de operações ok/erro da sessão atual.

Digite `/history` no menu para visualizar as últimas 10 operações.

---

---

### 21 — Análise de gaps de cobertura

Analisa a cobertura de testes no projeto Jira, identificando issues sem testes associados, agrupando por Epic e gerando relatório HTML com indicadores visuais.

**Fluxo:**

1. Executa JQL para buscar todas as issues do projeto
2. Busca links "is tested by" de cada issue
3. Identifica issues sem nenhum teste vinculado (gaps)
4. Converte relatório HTML com seções por tipo de issue e Epic
5. Abre o relatório no navegador ou exibe resumo no terminal

**Saída:** Arquivo HTML em `reports/coverage-gap-{timestamp}.html`

| Alias          | Resolve para |
| -------------- | ------------ |
| `gap-analysis` | `21`         |
| `gaps`         | `21`         |

---

### 22 — Impacto de mudanças (test impact)

Analisa o impacto potencial de mudanças em issues Jira, identificando quais testes existentes podem ser afetados por alterações em requisitos ou código.

**Fluxo:**

1. Busca a issue alvo e suas linked issues
2. Analisa relacionamentos de rastreabilidade (tests, blocks, relates to)
3. Gera relatório com lista de testes potencialmente impactados
4. Exibe resumo no terminal

**Uso:** Execute após identificar uma issue que sofreu alteração significativa, para saber quais testes precisam ser revisados.

| Alias         | Resolve para |
| ------------- | ------------ |
| `test-impact` | `22`         |
| `impacto`     | `22`         |

---

### 23 — Feedback de IA

Registra um feedback de análise de IA para uma issue Jira. Permite ao usuário fornecer uma avaliação qualitativa sobre a análise gerada pelo LLM, alimentando métricas de qualidade.

---

### 24 — Setup wizard CI/CD

Executa o wizard interativo de configuração de CI/CD. Gera pipelines GitHub Actions ou GitLab CI, configura projetos e hook pre-push.

**Fluxo:**

1. Detecta framework de testes (Cypress/Playwright/Jest/Vitest) a partir do `package.json`
2. Pergunta features desejadas (Jira, flakiness, análise IA)
3. Gera `.github/workflows/qa.yml` ou `.gitlab-ci.yml`
4. Cria `config/projects.json` + `config/providers.json`
5. Gera `.env.example` com variáveis necessárias
6. Instala hook `.git/hooks/pre-push` (opcional)

**Arquivo:** `setup/main.ts` — orquestração do wizard

| Alias          | Resolve para |
| -------------- | ------------ |
| `setup-wizard` | `24`         |
| `setup`        | `24`         |

---

**Fluxo:**

1. Informe a issue Jira (ex: `ECSPOL-123`)
2. Informe o tipo de feedback (positivo/negativo/neutro)
3. Adicione um comentário explicativo
4. A CLI registra o feedback no estado local para consulta futura

**Saída:** O feedback é persistido em `~/.local/state/qa_tools_state.json` e exibido no sumário da sessão.

| Alias         | Resolve para |
| ------------- | ------------ |
| `ai-feedback` | `23`         |
| `feedback`    | `23`         |

---

← [Voltar ao README](../README.md)
