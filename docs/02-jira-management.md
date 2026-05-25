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
- [11 — Gerar template CSV](#11--gerar-template-csv)
- [12 — Diagnosticar conexão](#12--diagnosticar-conexão)
- [13 — Criar Test Execution](#13--criar-test-execution)
- [14 — Alterar diretório Cypress](#14--alterar-diretório-cypress)
- [15 — Importar testes de JSON](#15--importar-testes-de-json)
- [16 — Alterar diretório JSON](#16--alterar-diretório-json)
- [17 — Gerar relatório HTML + análise IA](#17--gerar-relatório-html--análise-ia)
- [18 — Gerar testes de user story (IA)](#18--gerar-testes-de-user-story-ia)
- [19 — Comparar execuções com IA](#19--comparar-execuções-com-ia)

---

## Menu completo

| #   | Comando                                     | Seção        |
| --- | ------------------------------------------- | ------------ |
| 1   | Criar testes a partir de CSV                | TESTES       |
| 15  | Importar testes de JSON                     | TESTES       |
| 2   | Listar versões de release                   | RELEASES     |
| 3   | Criar nova versão                           | RELEASES     |
| 4   | Atribuir fixVersion às tarefas              | RELEASES     |
| 5   | Atualizar package.json + release notes      | RELEASES     |
| 6   | Verificar status das tarefas                | RELEASES     |
| 7   | Fechar tarefas automaticamente              | RELEASES     |
| 8   | Publicar versão                             | RELEASES     |
| 9   | Alterar projeto Jira                        | CONFIGURACAO |
| 10  | Alterar diretório git                       | CONFIGURACAO |
| 14  | Alterar diretório Cypress                   | CONFIGURACAO |
| 16  | Alterar diretório JSON                      | CONFIGURACAO |
| 11  | Gerar template CSV                          | UTILITARIOS  |
| 12  | Diagnosticar conexão                        | UTILITARIOS  |
| 13  | Criar Test Execution para testes existentes | UTILITARIOS  |
| 17  | Gerar relatório HTML + análise IA           | IA           |
| 18  | Gerar testes com IA                         | IA           |
| 19  | Histórico / Cobertura / Comparação IA       | IA           |
| 0   | Sair                                        | —            |

**Aliases disponíveis:** `criar` (1), `versoes` (2), `fechar` (7), `publicar` (8), `template` (11), `testexec` (13), `json` (15), entre outros.

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
- `test-case-validator.ts` — validação dos `TestCase`
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

### 11 — Gerar template CSV

Copia o arquivo `test_steps_template.csv` (modelo canônico com exemplos de todos os campos e formatos) para o caminho informado pelo usuário.

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

| Variável              | Descrição                                         | Obrigatória |
| --------------------- | ------------------------------------------------- | ----------- |
| `JIRA_BASE_URL`       | URL base do Jira (ex: `https://seu-jira-server`)  | Sim         |
| `JIRA_PERSONAL_TOKEN` | Token de autenticação Bearer                      | Sim         |
| `XRAY_BASE_URL`       | URL base do Xray (necessária para criar testes)   | Sim         |
| `JIRA_PROJECT`        | Projeto Jira padrão (opcional, fallback `ECSPOL`) | Não         |
| `CSV_DEFAULT_PATH`    | Caminho padrão do CSV                             | Não         |
| `CSV_LABELS`          | Labels padrão separadas por vírgula               | Não         |
| `AUTO_CHOICE`         | Opção automática do menu (para scripting)         | Não         |
| `AUTO_CONFIRM`        | Pular confirmações (true/false)                   | Não         |
| `DEBUG`               | Modo debug com logging adicional                  | Não         |

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

1. **Opção 11** — Gere o template CSV como base.
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

Gera um relatório HTML interativo a partir de um arquivo `mochawesome.json` e, opcionalmente, enriquece com análise de falhas por IA.

### Fluxo

1. Informa o caminho do JSON do Mochawesome
2. Parseia com `result_parser.ts` — extrai `title`, `state`, `duration`
3. Gera HTML com `generateHtmlReport()` incluindo:
    - Estatísticas (passados, falhas, skipped, duração total)
    - Tabela de testes com cores por status
    - Gráfico SVG de distribuição
4. Se houver testes falhos, pergunta: _"Deseja analisar falhas com IA?"_
    - Se sim, chama `analyzeFailuresWithReport()` — pipeline LLM (report → validate → retry → reviewer → fallback)
    - Insere seção "Análise IA" no HTML com badge de confiança (🟢 alta / 🟡 média / 🔴 baixa)
    - Se fallback ativo, exibe ⚠ warning no relatório
5. Salva HTML no diretório do JSON de origem

**Arquivo:** `jira_management/commands/case17.ts`

---

## 18 — Gerar testes de user story (IA)

> ⚠ Funcionalidade **exclusivamente baseada em IA**. Requer `LLM_API_KEY` configurada e provedor **main** acessível. Sem LLM, a operação é cancelada com mensagem de erro.

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

## 19 — Comparar execuções com IA

> Histórico de execuções, análise de flakiness, tendências e cobertura Jira funcionam **sem LLM**. A comparação narrativa com IA é um adicional — se o LLM falhar, a seção é omitida silenciosamente e as demais funcionalidades permanecem intactas.

Compara as duas últimas execuções de teste e gera uma análise narrativa com IA sobre tendências.

### Fluxo

1. Exibe as últimas execuções disponíveis
2. Seleciona as duas execuções a comparar
3. Chama `compareRuns()` com tier **fast** — analisa:
    - Variação de pass rate
    - Novas falhas introduzidas
    - Tendência geral (melhora, piora, estável)
4. Exibe análise textual de 3–5 sentenças

**Arquivo:** `jira_management/commands/case19.ts`

---

## Histórico de operações

Todas as operações são registradas em `~/.local/state/qa_tools_state.json` com timestamp, operação, detalhe e status. As últimas 50 operações ficam disponíveis. O menu exibe contadores de operações ok/erro da sessão atual.

Digite `/history` no menu para visualizar as últimas 10 operações.

---

← [Voltar ao README](../README.md)
