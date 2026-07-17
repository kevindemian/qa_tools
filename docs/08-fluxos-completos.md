# 08 — Fluxos Completos (Cookbook)

Três jornadas completas de ponta a ponta, com referências cruzadas para os documentos detalhados.

---

## Fluxo 1: Importar testes de CSV e criar Test Execution

Este fluxo cobre desde a preparação do CSV até a criação de uma **Test Execution** no Xray.

### Passo a passo

1. **Preparar o arquivo CSV**

    Consulte o formato esperado em [`04-csv-format.md`](04-csv-format.md).  
    O CSV utiliza blocos separados por `---`, com campos `Title:`, `Description:`, `Pre-condition:`, `Group:` e uma tabela `Action,Data,Expected Result`.

    Dica: use a **opção 11** "Gerar template CSV/JSON" (menu `GERAÇÃO DE CASOS DE TESTE`) para obter um arquivo modelo.

2. **Executar a CLI**

    ```bash
    npx tsx jira_management/main.ts
    ```

3. **Selecionar a opção 1 — "Criar testes a partir de CSV"**

    Você também pode digitar o alias `criar` diretamente.

4. **Informar o caminho do CSV**

    A CLI pergunta: `"Caminho do arquivo CSV"`.  
    O diretório padrão sugerido vem de `CSV_DEFAULT_PATH` no `.env`.  
    Se preferir, informe um caminho absoluto.

5. **Informar labels (opcional)**

    Labels separadas por vírgula que serão aplicadas a todos os testes criados.

6. **Revisar o preview**

    A CLI exibe uma prévia com:
    - Título de cada teste
    - Snippet da descrição
    - Pré-condição (inline ou referência a outra issue)
    - Quantidade de linked issues
    - Grupo
    - Número de steps + primeiro/último passo

    Use este momento para validar os dados antes da criação.

7. **Confirmar a criação**

    A CLI pergunta: `"Criar estes testes no Jira?"`. Responda `sim`.

    Se `DRY_RUN=true` no `.env`, a operação é simulada sem chamadas à API.

8. **Acompanhar o progresso**
    - Cada teste é criado via `POST /rest/api/2/issue` com `issuetype: Test`.
    - Steps são enviados via API do Xray.
    - Pré-condições são associadas automaticamente.
    - Linked issues são criadas com o tipo "Tests".
    - Testes do mesmo grupo recebem referências cruzadas na descrição.

    Se houver erro, a CLI pergunta: `retry/abort/skip`.

9. **Mapping files**

    Ao final, três arquivos são gerados no diretório Cypress:
    - `{csvname}-jira-mapping.json` — usado depois para casar resultados de pipeline
    - `{csvname}-jira-mapping.md` — resumo em Markdown
    - `{csvname}-summary.txt` — lista simples `KEY: title`

10. **Criar Test Execution**

    A CLI pergunta: `"Criar Test Execution para N testes criados?"`.  
    Se responder `sim`, a Test Execution é criada com todos os testes vinculados.

11. **Alternativa pós-importação**

    Se optou por não criar na hora, use depois a **opção 13** "Criar Test Execution para testes existentes".  
    Ela usa os testes em memória (do último CSV importado) ou permite digitar as keys manualmente.

### Diagrama resumido

```
CSV → Preview → Confirmar → Criar issues → Associar pré-condições
                                        ↓
                              Linkar issues → Mapping files
                                        ↓
                              Criar Test Execution? (sim/não)
```

---

## Fluxo 2: Release completa

Gerencia uma release do início ao fim: criar versão, atribuir tarefas, verificar status, fechar, atualizar artefatos e publicar.

### Passo a passo

1. **Opção 2 — Listar versões**

    Exibe todas as versões do projeto Jira configurado (`JIRA_PROJECT`).  
    Mostra nome, descrição, se já foi publicada (`released`) e indicadores de atraso.

    Use para confirmar o nome exato da versão que será trabalhada.

2. **Opção 3 — Criar nova versão**

    Informe o nome (ex: `v1.2.3`) e descrição opcional.  
    A CLI cria a versão via `POST /rest/api/2/version` com `released: false`.  
    Se a versão já existir, um aviso é exibido.

3. **Opção 4 — Atribuir tarefas à versão (fixVersion)**
    - A CLI pergunta se quer usar as tarefas em memória (do último CSV) ou digitar manualmente.
    - Informe o nome da versão.
    - Veja o preview e confirme.
    - Cada tarefa recebe `fixVersions: [{ id }]` via PUT.
    - Opcionalmente, as tarefas também são adicionadas a uma sprint.

4. **Opção 6 — Verificar status das tarefas**

    A CLI executa uma JQL: `project = X AND fixVersion = "vX.Y.Z"`.  
    Lista cada issue com seu status atual.  
    Se alguma não estiver em "Done" ou "In Use", a CLI alerta.

    ⚠️ **Não pule esta etapa.** A publicação pode falhar se houver tarefas pendentes.

5. **Opção 7 — Fechar tarefas automaticamente**

    Informe o nome da versão. A CLI:
    - Obtém todas as tarefas da versão
    - Para cada uma, lê o status atual
    - Aplica as transições de workflow necessárias até chegar em "Done"

    Mapa de transições usado:

    | Status atual       | Transições aplicadas    |
    | ------------------ | ----------------------- |
    | New                | approve → use test case |
    | Coding in Progress | coding done → done      |
    | Coding done        | done                    |
    | Approve            | use test case           |

    Tarefas já em "Done" ou "In Use" são ignoradas.

6. **Opção 5 — Atualizar package.json + release notes**

    A CLI pede o diretório git do projeto.  
    Em sequência:
    - Lê `ReleaseNotes.txt` em `{projectDir}/release_notes/`
    - Prepend um novo bloco de release com a lista de tarefas fechadas
    - Atualiza o campo `version` no `package.json` do projeto

7. **Opção 8 — Publicar versão**

    Informe o nome da versão. A CLI:
    - Verifica novamente se todas as tarefas estão concluídas (rejeita se não)
    - Marca a versão como `released: true` com data atual
    - A versão fica visível no Jira como "Released"

### Diagrama resumido

```
Listar → Criar versão → Atribuir tarefas → Verificar status
                                              ↓
                              Fechar tarefas → Atualizar package.json + release notes
                                              ↓
                                          Publicar
```

---

## Fluxo 3: Pipeline CI → Resultados → Test Execution

Integra resultados de pipeline CI (GitLab ou GitHub) ao Jira/Xray, criando uma Test Execution com o status de cada teste.

### Passo a passo

1. **Executar o git_triggers**

    ```bash
    npx tsx git_triggers/main.ts
    ```

2. **Selecionar o projeto**

    A CLI lista os seus projetos. Escolha pelo número. Exemplo:

    ```
    1 - qa_ibabs (gitlab)
    2 - qa_ibabs_cast (gitlab)
    ```

    O provedor (GitLab/GitHub) já foi definido quando o projeto foi registrado.
    Para pular a seleção, use `--project <nome>` ao abrir o CLI (ver
    [`07-projetos-registry.md`](07-projetos-registry.md)).

3. **Opção 1 — Disparar pipeline**

    Informe:
    - Branch (a CLI valida se existe)
    - Variáveis CI/CD opcionais no formato `chave=valor`

    A CLI mostra um preview e confirma antes de disparar.

4. **Aguardar conclusão**

    A CLI pergunta se deve aguardar.  
    Se sim, faz polling a cada 5 segundos (timeout padrão: 300s).  
    O resultado (sucesso/falha) é exibido ao final.

5. **Coletar artefatos**

    Após a pipeline, a CLI oferece "Collect results to Jira".  
    Internamente:
    - Lista artefatos da pipeline, filtrando por `mochawesome|test-result`
    - Faz download do ZIP do artefato via API
    - Extrai o `mochawesome.json` usando `AdmZip`

6. **Parse dos resultados**

    O `result_parser.ts` percorre as suites do Mochawesome recursivamente e extrai:
    - `title` — nome do teste
    - `state` — `passed`, `failed` ou `skipped`
    - `duration` — tempo de execução

    Retorna também estatísticas: `{ passed, failed, skipped, total, duration }`.

7. **Mapear resultados para keys Jira**

    A CLI pergunta o caminho do mapping file (gerado no **Fluxo 1**, passo 9).  
    O `result_reporter.ts` faz fuzzy matching:
    1. Tenta match exato do título
    2. Case-insensitive contains
    3. Normalizado (remove não-alfanuméricos)

    Resultado: `{ matched: [{ key, title, status, duration }], unmatched: [{ title, state }] }`

    Testes sem match são reportados como "unmatched" para revisão manual.

8. **Criar Test Execution com resultados**

    A CLI cria uma Test Execution com resumo no formato:

    ```
    Resultados: {csvname} ({branch} #{pipelineId}) - {timestamp}
    ```

    - Testes `passed` e `failed` são vinculados à TE
    - Testes `skipped` são ignorados
    - Ao final, exibe o link: `{jiraBase}/browse/{TE-key}`

### Diagrama resumido

```
Selecionar projeto → Disparar pipeline → Aguardar conclusão
                                              ↓
                              Coletar artefatos → Parse Mochawesome
                                              ↓
                              Mapear (mapping.json) → Criar Test Execution
```

### Variáveis de ambiente relevantes

| Variável         | Função no fluxo                              |
| ---------------- | -------------------------------------------- |
| `GIT_BASE_URL`   | URL do GitLab (para buscar artefatos)        |
| `GIT_TOKEN`      | Token de autenticação GitLab                 |
| `GITHUB_TOKEN`   | Token de autenticação GitHub                 |
| `GITHUB_API_URL` | URL da API GitHub (padrão: `api.github.com`) |

---

## Fluxo 4: Pipeline CI → Coleta → Análise IA → Relatório HTML

Este fluxo adiciona a **análise de falhas com IA** e geração de **relatório HTML** ao fluxo 3 de pipeline. A análise IA é opcional — o relatório HTML e o mapeamento para Jira funcionam sem LLM.

### Pré-requisitos

- **Obrigatório:** Pipeline CI que gere artefato `mochawesome.json`
- **Opcional (para análise IA):** `LLM_API_KEY` configurada no `.env` (ver [`06-env-vars.md`](06-env-vars.md))

### Passo a passo

1. **Disparar pipeline (Opção 1)**

    Segue o fluxo normal (selecionar projeto, branch, variáveis).

2. **Aguardar conclusão**

    Polling automático com timeout de 5 minutos.

3. **Coletar artefatos e parsear**

    Download do ZIP do Mochawesome → extrai `mochawesome.json` → parse para `FlatTest[]`.

4. **Análise de falhas com IA** _(opcional — independente do LLM)_

    Se houver testes falhos, a CLI pergunta: _"Deseja analisar falhas com IA?"_

    **Se o usuário recusar ou LLM estiver indisponível:** o fluxo segue para o passo 5 sem IA. O relatório é gerado completo, apenas sem a seção de análise.

    **Se confirmado**, o pipeline interno executa:

    ```
    Enviar falhas → LLM report tier → Validar JSON → Retry (≤3) → Revisor Gemini → Fallback
    ```

    - **Report tier** (OpenRouter, `gemini-2.0-flash-exp`, temp 0.2, `response_format: json`):
      Classifica cada falha com `classification`, `severity`, `recommendation`
    - **Validação** (`ReportValidator`): schema com required fields, tipos, regex (`ASSERTION|TIMEOUT|...`)
    - **Retry** (até 3x): feedback dos erros de validação no prompt
    - **Reviewer tier** (Gemini): avalia confiança — `AGREE` (alta), `PARTIAL` (média), `DISAGREE` (baixa)
    - **Fallback** (tier `main`): se report falha após 3 tentativas, usa análise textual simples

5. **Relatório HTML** _(sempre gerado, com ou sem LLM)_

    Relatório gerado inclui **sempre**:
    - Estatísticas de execução (passed, failed, skipped, duração)
    - Gráfico SVG de distribuição
    - Tabela de testes com cores por status

    **Adicional (se IA foi usada):**
    - **Seção "Análise IA"** com badge de confiança (🟢 alta / 🟡 média / 🔴 baixa)
    - ⚠ Warning se fallback foi ativado

6. **Mapeamento para Jira (opcional)**

    Mesmo fluxo do Fluxo 3: mapping → Test Execution → link.

### Diagrama resumido

```
Selecionar projeto → Disparar pipeline → Aguardar conclusão
                                              ↓
                              Coletar artefatos → Parse Mochawesome
                                              ↓
                              ┌─ [Falhas?] ──┐
                              │              │
                              Sim            Não
                              │              │
                    ┌─ "Analisar IA?" ─┐     │
                    │  Sim       Não   │     │
                    │   ↓         ↓    │     │
                    │  LLM     Relatório     │
                    │   ↓         ↓    │     │
                    │  HTML      HTML  │     │
                    └───┬─────────┘    │     │
                        ↓             ↓     ↓
                    Mapear → Test Execution
```

### Arquivos envolvidos

| Arquivo                        | Função                                          |
| ------------------------------ | ----------------------------------------------- |
| `git_triggers/llm-pipeline.ts` | Orquestrador da análise IA pós-pipeline         |
| `shared/failure-analysis.ts`   | `analyzeFailuresWithReport()` — pipeline LLM    |
| `shared/llm-review.ts`         | `reviewWithLlm()` — validação + retry + revisor |
| `shared/llm-client.ts`         | Cliente multi-tier com cache e fallback         |
| `shared/report-generator.ts`   | `generateReportWithFallback()` — HTML com badge |
| `shared/report-validator.ts`   | `ReportValidator` — schema JSON                 |
| `shared/llm-metrics.ts`        | Métricas persistidas em JSON                    |

---

## Fluxo 5: Setup inicial de CI/CD com QA Tools

Configura um projeto do zero: pipeline CI, configuração de projeto e hook pre-push.

### Passo a passo

1. **Executar o wizard**

    ```bash
    npx tsx setup/main.ts
    ```

2. **Revisar a detecção automática**

    O wizard detecta o framework (Cypress/Playwright/Jest/Vitest) a partir do `package.json` e sugere comando de teste, caminho CTRF e comando de instalação.

3. **Informar dados do repositório**
    - Nome do projeto (default: nome do repo extraído do `.git/config`)
    - Git provider (detectado automaticamente: GitHub/GitLab)
    - Repo owner (user/org)

4. **Escolher features**

    O wizard pergunta se deseja:
    - Integração com Jira (Test Execution, bugs)
    - Flakiness Dashboard
    - Análise de falhas com IA
    - Hook pre-push (executa testes antes do push)

5. **Revisar arquivos gerados**

    Ao final, o wizard lista todos os arquivos criados e registra o projeto para
    uso nas próximas execuções:

    ```
    ✅ Criado: .github/workflows/qa.yml
    ✅ Criado: .env.example
    ⏭️  Ignorado (já existe): .git/hooks/pre-push
    ```

6. **Commit e configuração**

    ```bash
    git add .
    git commit -m "chore: add QA Tools setup"
    cp .env.example .env   # edite com suas credenciais
    ```

### Diagrama resumido

```
Detectar framework → Configurar projeto → Escolher features
                                              ↓
                          Gerar pipeline CI + config + .env + hook
                                              ↓
                                        Commit + push
```

### Arquivos envolvidos

| Arquivo                             | Função                   |
| ----------------------------------- | ------------------------ |
| `setup/main.ts`                     | CLI wizard interativo    |
| `setup/detector.ts`                 | Detecção de framework    |
| `setup/builder/workflow-builder.ts` | Geração YAML via AST     |
| `setup/templates/github-ci.ts`      | Template GitHub Actions  |
| `setup/templates/gitlab-ci.ts`      | Template GitLab CI       |
| `setup/templates/pre-push-hook.ts`  | Script pre-push          |
| `setup/config-writer.ts`            | Geração de config + .env |

---

## Ver também
