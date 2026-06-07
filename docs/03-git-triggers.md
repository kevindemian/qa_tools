# Git Triggers — CLI Interativo

Ferramenta de linha de comando para automação de operações Git em projetos de QA. Oferece um menu interativo para disparar pipelines, gerenciar merge requests, coletar resultados de testes e nivelar branches.

---

## 1. Execução

```bash
npx tsx git_triggers/main.ts
```

Ao iniciar, um menu interativo é exibido. O usuário seleciona um projeto (mapeado em `config/projects.json`) e acessa as operações disponíveis.

**Opções do menu:**

| #      | Operação                                 |
| ------ | ---------------------------------------- |
| 00 / w | Setup wizard CI/CD                       |
| 1      | Disparar pipeline                        |
| 2      | Listar schedules (GitLab)                |
| 3      | Disparar schedule (GitLab)               |
| 4      | Criar MR/PR                              |
| 5      | Listar MRs/PRs aprovados                 |
| 6      | Fazer merge por ID                       |
| 7      | Nivelar branches (main → rel_cand → dev) |
| 8      | Exportar variáveis CI/CD                 |
| 9      | Trocar de projeto                        |
| a      | Dashboard flakiness (HTML)               |
| b      | Executar batch                           |
| c      | Comparar execuções (HTML)                |
| d      | Dashboards individuais (submenu)         |
| e      | Git Metrics Adapter (doc)                |
| g      | Bug Report Interativo                    |
| i      | AI PR Description                        |
| p      | Pipeline health (HTML)                   |
| q      | Quality Gate (HTML)                      |
| r      | Relatório completo de qualidade          |
| t      | Toggle: Bug automático                   |
| 0      | Sair / Voltar                            |

Em qualquer prompt, comandos adicionais estão disponíveis:

- `/help` — exibe lista de comandos
- `/history` — mostra últimas 10 operações
- `/back`, `/menu` — volta ao menu
- `/exit`, `/sair`, `/quit` — encerra sessão

Ao pressionar **Enter** sem digitar nada, a última opção escolhida é repetida automaticamente (exceto `0`).

Em terminais não-TTY ou modo quiet (`QUIET=true`), o menu é renderizado em modo texto com `readline-sync` em vez de setas interativas.

---

## 2. Provedores Suportados

### GitLab

- Gerenciado por `GitLabManager` (`git_triggers/gitlab_manager.ts`)
- Autenticação via `PRIVATE-TOKEN` (variável `GIT_TOKEN`)
- URL base configurável via `GIT_BASE_URL`
- Suporte a schedules, pipelines, artifacts, MRs, variáveis CI/CD

### GitHub

- Gerenciado por `GitHubManager` (`git_triggers/github_manager.ts`)
- Autenticação via Bearer token (variável `GITHUB_TOKEN`)
- URL base configurável via `GITHUB_API_URL`
- Workflows disparados via `workflow_dispatch`
- Suporte a workflows, artifacts, PRs, variáveis CI/CD

A seleção do provedor é feita por projeto no arquivo `config/providers.json`.

---

## 3. Configuração

### `config/projects.json`

Mapeia nomes de projeto → identificador no provedor:

```json
{
    "qa_ibabs": "47849962",
    "qa_irmanager": "41268567"
}
```

- **GitLab**: valor = Project ID (inteiro)
- **GitHub**: valor = `"owner/repo"`
- Pode ser sobrescrito por variável de ambiente `PROJECT_ID_<NOME_MAIUSCULO>`

### `config/providers.json`

Define o provedor de cada projeto:

```json
{
    "qa_ibabs": { "provider": "gitlab" },
    "qa_irmanager": { "provider": "github", "repo": "myorg/qa-irmanager" }
}
```

- `provider`: `"gitlab"` | `"github"`
- `repo` (GitHub): opcional, substitui o valor de `projects.json` como `owner/repo`

### `config/reviewers.json`

Lista de IDs de revisores para MRs (IDs do GitLab):

```json
[12161752, 14566471, 23136801]
```

---

## 4. Pipeline Trigger (Opção 1)

1. Solicita o **branch** para disparo
2. Valida se o branch existe no repositório (`gitlab.getBranch()`)
3. Opcional: especificar **Workflow ID** (GitHub) para selecionar qual workflow disparar
4. Opcional: adicionar **variáveis** no formato `chave=valor`
5. Exibe preview e confirmação antes do disparo
6. Se confirmado, chama `triggerPipeline()` no manager correspondente

**GitLab**: POST `/projects/:id/pipeline` com `ref` e `variables`

**GitHub**: POST `/repos/:owner/:repo/actions/workflows/:id/dispatches` com `ref` e `inputs`

---

## 5. Pipeline Polling

Após disparar uma pipeline, o usuário pode optar por **aguardar a conclusão**:

```typescript
async function pollPipeline(m, pipelineId, interval = 5000, timeout = 300000);
```

- Polling a cada **5 segundos**
- Log a cada **15 segundos** informando o tempo decorrido
- Timeout padrão de **5 minutos**
- Estados de conclusão: `success`, `failed`, `canceled`, `skipped`
- Ao final, exibe o status com ícone (✓ success / ✗ failed)

---

## 6. Resultados de Teste

Fluxo executado após pipeline concluída com sucesso (opção `"Coletar resultados para Jira?"`):

### 6.1 Download de Artifacts

1. Lista artifacts da pipeline via `listPipelineArtifacts()`
2. Filtra por nome contendo `mochawesome` ou `test-result`
3. Faz download do ZIP via `downloadArtifact()`

### 6.2 Parse Mochawesome

1. Extrai `mochawesome.json` do ZIP
2. Parse com `parseMochawesome()` (`shared/result_parser.ts`)
3. Achatamento hierárquico de suítes aninhadas
4. Classificação: `passed`, `failed`, `skipped`

### 6.3 Mapeamento para Jira

1. Solicita caminho do **mapping JSON** (arquivo `*jira-mapping.json`)
2. Faz `matchResultsToTests()` — cruza títulos dos testes com o mapping
3. Cria **Test Execution** no Jira via `createTestExecutionFromResults()`
4. Utiliza `JiraResource` e `JiraLinkManager` para criar a issue e links

### 6.4 Análise de Falhas com IA

> A análise IA é **opcional** — o relatório HTML base (stats, tabela, gráfico) e o fluxo de mapeamento para Jira funcionam **sem LLM**. A IA é um enriquecimento adicional.

Após o parse, se houver testes falhos, a CLI pergunta: _"Deseja analisar falhas com IA?"_

**Pipeline de análise (`llm-review.ts`):**

1. **Tier `report`** — Envia lista de falhas formatada com prompt de `shared/prompts/failure-analysis.md`
2. **Validação JSON** — `ReportValidator` verifica schema: `tests[].{title, classification, severity, recommendation}`
3. **Retry** — Até 3 tentativas com feedback dos erros de validação
4. **Revisor** — Tier `reviewer` (Gemini) avalia confiança: `AGREE` (alta), `PARTIAL` (média), `DISAGREE` (baixa)
5. **Fallback** — Se report falha, cai para tier `main`; se reviewer falha, retorna confidence `medium`

**Resultado:**

- Classificação por causa raiz: `ASSERTION`, `TIMEOUT`, `ENVIRONMENT`, `FLAKY`, `APPLICATION`, `UNKNOWN`
- Severidade: `high`, `medium`, `low`
- Recomendação textual de correção
- Badge de confiança no relatório HTML (🟢 alta / 🟡 média / 🔴 baixa)

**Saída:** relatório HTML salvo no diretório de origem com:

- Seção "Análise IA" com badge de confiança
- Fallback warning (⚠) se IA indisponível
- Métricas de qualidade: `totalRequests`, `rejectedByValidator`, `retryCount`

**Métricas:** Cada análise gera um snapshot persistido em `~/.local/state/qa-tools/llm-metrics.json` via `llm-metrics.ts` (6 contadores: requests, falhas, validações rejeitadas, retries, confiança, latência).

**Arquivos:** `git_triggers/llm-pipeline.ts`, `shared/failure-analysis.ts`, `shared/llm-review.ts`, `shared/report-generator.ts`, `shared/llm-metrics.ts`, `shared/report-validator.ts`

**Comportamento sem LLM:**
| Situação | Ocorre |
|----------|--------|
| Usuário recusa análise IA | Relatório HTML gerado sem seção IA — funcionalidade completa |
| Report tier falha | Cai para `main` tier; se também falhar, relatório gerado sem IA com ⚠ warning |
| `LLM_API_KEY` não configurada | Análise IA retorna vazia; pipeline segue normalmente com mensagem "verifique chaves LLM" |
| Apenas tier **fast** configurado (PR desc) | Pipeline de resultados não é afetado — **fast** é usado apenas em features separadas |
| Circuit breaker aberto | LLM pula automaticamente; pipeline segue sem IA — veja [`docs/06-env-vars.md`](06-env-vars.md) > Circuit Breaker |

> Consulte [`docs/06-env-vars.md`](06-env-vars.md) para detalhes sobre **circuit breaker** (proteção contra falhas encadeadas) e **benchmark LLM** (validação de acurácia dos provedores).

---

## 7. Merge Requests

### Criar MR/PR (Opção 4)

- Solicita: branch de origem, branch de destino, título e descrição
- Cria via `createMergeRequest()`
- **GitLab**: POST `/projects/:id/merge_requests`
- **GitHub**: POST `/repos/:owner/:repo/pulls`
- Se já existir MR/PR aberto com mesma origem/destino (erro 409/422), **atualiza** o existente via `updateMergeRequest()`

### Listar MRs/PRs Aprovados (Opção 5)

- Busca MRs/PRs abertos
- Filtra por `isApproved()`:
    - **GitLab**: GET `/merge_requests/:iid/approvals`
    - **GitHub**: GET `/pulls/:number/reviews` (verifica `state === 'APPROVED'`)
- Exibe lista dos aprovados

### Fazer Merge por ID (Opção 6)

- Solicita ID do MR/PR
- Verifica se já está merged; se sim, retorna
- Executa merge via `acceptMergeRequest()`
- **GitLab**: PUT `/merge_requests/:iid/merge`
- **GitHub**: PUT `/pulls/:number/merge`

### Merge Request Rápido (pós-pipeline)

Após coleta de resultados, o menu pergunta:

1. "Criar merge request de \<branch\> para?" — informa branch de destino
2. "Fazer merge agora?" — executa merge imediato

---

## 8. Nivelar Branches (`nivelar.ts`)

Operação **cascata** para sincronizar branches:

```
main  ──MR──→  rel_cand  ──MR──→  dev
```

### Fluxo

1. Solicita nomes das branches (padrões: `main`, `rel_cand`, `dev`)
2. Valida se todas existem (`getBranch()`)
3. Cria MR `main → rel_cand` com título `chore: nivelamento main -> rel_cand`
4. Cria MR `rel_cand → dev` com título `chore: nivelamento rel_cand -> dev`
5. Se uma branch não existir, a operação é abortada antes de criar qualquer MR

---

## 9. Flakiness Dashboard (Opção 'a')

Gera um dashboard HTML com análises de flakiness dos testes a partir do histórico de execuções armazenado em `~/.local/state/qa-tools/metrics.json`.

### Fluxo

1. Carrega métricas via `loadMetrics()` — filtra execuções do projeto atual
2. Valida: mínimo de **2 execuções** registradas
3. Calcula flakiness via `calculateFlakiness()` — taxa de transição `passed→failed` e `failed→passed` por teste
4. Gera HTML via `generateFlakinessHtml()` com:
    - Tabela de testes com taxa de flakiness (%), total de runs
    - Destaque em vermelho para testes com flakiness > 30%
    - Ordenação decrescente por taxa
5. Salva em `reports/<data>/flakiness-<projeto>.html`
6. Registra no histórico com contagem de testes com flakiness > 30%

### Arquivos relacionados

- `schedule-handler.ts` — função `handleFlakinessDashboard()`
- `shared/metrics.ts` — `loadMetrics()`, `calculateFlakiness()`
- `shared/flakiness-dashboard.ts` — `generateFlakinessHtml()`

### Flaky Auto-Actions

> Automatiza a resposta a testes flaky detectados no pipeline. Executado ao final do batch mode (`tryBatchMode()` → `runFlakyAutoActions()`).

**Comportamento:**

1. **Cálculo**: `calculateFlakinessWithWindow()` analisa as últimas 20 execuções (janela deslizante).
2. **Threshold**: taxa de falha > 30% → considerado flaky. Testes com taxa ≤ 30% e bug Jira aberto → re-enable automático.
3. **Ações disponíveis**:
    - `create_bug` — Cria issue Bug no Jira com label `flaky`, `auto-generated` e descrição detalhada (taxa, contagem pass/fail, ações recomendadas)
    - `flag_in_report` — Marca no relatório HTML sem criar bug (quando `autoCreateBug=false`)
    - `reenable` — Se taxa caiu ≤ 30% e existe bug aberto, faz transição para Done/Closed
    - `none` — Bug já existe (dedupSearch evita duplicatas)
4. **Quarentena**: testes flaky são auto-excluídos do pipeline via `quarantineTest()` → `qa-quarantine.json` com TTL de 7 dias
5. **Dedup**: `searchExistingBug()` busca por `project = X AND summary ~ "[Flaky] <titulo>"` antes de criar

**Configuração:**

| Parâmetro       | Padrão | Descrição                                  |
| --------------- | ------ | ------------------------------------------ |
| `threshold`     | 0.3    | Taxa de falha mínima para considerar flaky |
| `autoCreateBug` | false  | Cria bug Jira automaticamente              |
| `minTotalRuns`  | 10     | Mínimo de execuções para análise           |
| `windowSize`    | 20     | Janela deslizante de execuções             |
| `dedupSearch`   | true   | Evita criar bug duplicado                  |

**Arquivo:** `shared/flaky-auto-actions.ts` — `executeFlakyActions()`

---

## 10. Batch Mode (Opção `b`)

> Execução não-interativa para pipelines CI/CD. Detecta automaticamente os argumentos `--batch` / `--auto` (e também `--project` ou `--branch` sozinhos) e executa sem prompts.

O batch mode permite disparar uma pipeline, coletar resultados, analisar falhas com IA e gerar dashboard de flakiness em **um único comando**. No menu interativo, a opção `b` executa `tryBatchMode()`.

### Flags

| Flag                   | Descrição                                               |
| ---------------------- | ------------------------------------------------------- |
| `--batch` ou `--auto`  | Ativa modo batch (implica `AUTO_CONFIRM=true`)          |
| `--project` / `-p`     | Nome do projeto (fallback: primeiro do `projects.json`) |
| `--branch` / `-b`      | Branch para disparo (fallback: `main`)                  |
| `--run-impacted-tests` | Analisa diff desde HEAD~1 e gera `test-selection.json`  |
| `--conservative`       | Modo conservador: smoke obrigatórios + testes afetados  |
| `--skip-flaky`         | Pula análise de flaky e auto-actions                    |
| `--skip-ia`            | Pula análise IA de falhas                               |
| `--skip-dashboard`     | Pula geração de dashboards                              |
| `--output-dir` / `-o`  | Diretório de saída para relatórios e dashboards         |

### Exemplos

```bash
# Disparar pipeline no projeto padrão, branch main
npx tsx git_triggers/main.ts --batch

# Projeto e branch específicos
npx tsx git_triggers/main.ts --batch --project qa_ibabs --branch release/v2
```

### Fluxo

1. `parseBatchArgs()` analisa `process.argv` em busca das flags
2. Carrega projeto de `config/projects.json` (ou usa o especificado)
3. Configura manager (`GitLabManager` / `GitHubManager`) e define sessão
4. Valida branch via `getBranch()`
5. Dispara pipeline via `triggerPipeline()`
6. Faz polling até conclusão (`pollPipeline()`)
7. Coleta resultados de teste (`collectTestResults()`)
8. Se houver falhas, oferece análise IA (`offerPipelineFailureAnalysis()`)
9. Gera dashboard de flakiness (`generateFlakinessDashboard()`)
10. Exibe `printSessionSummary()` e encerra

### Test Selection (--run-impacted-tests)

Quando `--run-impacted-tests` é passado, o batch mode executa análise de impacto de testes após a coleta de resultados:

1. Obtém diff de arquivos desde `HEAD~1` via `git diff --name-only`
2. Executa análise de impacto em 3 tiers (jest `--findRelatedTests`, keyword matching, mapping explícito)
3. Gera `reports/test-selection.json` com a lista de testes impactados

**`test-selection.json`:**

| Campo              | Tipo     | Descrição                                       |
| ------------------ | -------- | ----------------------------------------------- |
| `generatedAt`      | string   | Timestamp ISO da geração                        |
| `changedFiles`     | string[] | Arquivos modificados no diff                    |
| `impactedTests`    | array    | Testes impactados com título, reason, matchMode |
| `suggestedCommand` | string   | Comando sugerido para executar os testes        |
| `confidence`       | string   | `high` / `medium` / `low`                       |
| `conservative`     | boolean  | Se `--conservative` foi ativado                 |
| `smokeTests`       | string[] | Smoke obrigatórios (modo conservador)           |

O modo `--conservative` adiciona smoke obrigatórios à seleção, garantindo que testes críticos sejam executados mesmo se o diff não os indicar como impactados.

### Arquivo

- `batch-mode.ts` — `parseBatchArgs()`, `tryBatchMode()`, `setupBatchProject()`, `triggerAndCollectBatchPipeline()`
- `shared/test-impact.ts` — `analyzeTestImpact()`, `generateTestSelectionJson()`

---

## 11. Checkpoint (Pipeline Polling)

Se o pipeline polling for interrompido (Ctrl+C, falha), o progresso é **salvo no estado** para retomada:

```typescript
updateState({
    pendingPipeline: {
        branch: currentBranch,
        pipelineId: id,
        projectName: projectName,
    },
});
```

### Na próxima execução

1. Ao selecionar "Disparar pipeline" (opção 1), o sistema verifica se há `pendingPipeline`
2. Se encontrado e o projeto for o mesmo, pergunta: _"Pipeline pendente encontrada. Continuar deste ponto?"_
3. Se confirmado:
    - Remove o checkpoint do estado
    - Inicia polling da pipeline existente (sem redisparar)
    - Após conclusão, segue o fluxo normal de coleta de resultados e MR

### Persistência

O estado é salvo em `~/.local/state/qa-tools/state.json` (ou `$XDG_STATE_HOME/qa-tools/state.json`), com backup automático em `state.json.bak`.

---

## 12. AI PR / MR Description

> A descrição de PR/MR é gerada **exclusivamente com IA**. Se o LLM falhar, retorna string vazia (não bloqueia a criação do MR).

Gera descrição de Pull Request / Merge Request automaticamente a partir do diff entre branches usando IA (tier **fast**).

**Quando ocorre:** Sub-prompt da opção 4 (Criar MR/PR) — pergunta "Gerar descrição com IA?"

### Fluxo

1. Obtém o diff entre `source` e `target` via `GitProvider.getDiff()`
2. Envia o diff para o LLM (tier **fast** — Groq `llama3-8b-8192`)
3. LLM retorna descrição em português com:
    - Resumo das alterações
    - Arquivos modificados
    - Impacto funcional
4. Retorna string vazia em caso de erro (não bloqueia o fluxo)

**Arquivo:** `git_triggers/ai-pr-desc.ts`

---

## 13. AI Test Impact Analysis

Analisa o impacto de alterações nos testes existentes usando o diff entre branches (tier **fast**).

**Quando ocorre:** Sub-prompt da opção 4 (Criar MR/PR) — pergunta "Analisar impacto nos testes com IA?"

### Fluxo

1. Obtém o diff entre `source` e `target` via `GitProvider.getDiff()`
2. Opcional: carrega mapping JSON de testes existentes
3. Envia para LLM (tier **fast**) que avalia:
    - Quais testes existentes são afetados
    - Risco da alteração (alto/médio/baixo)
    - Se novos testes devem ser adicionados
4. Exibe análise textual

**Arquivo:** `git_triggers/ai-test-impact.ts`

---

## Variáveis de Ambiente

| Variável              | Obrigatória | Descrição                                                               |
| --------------------- | ----------- | ----------------------------------------------------------------------- |
| `GIT_TOKEN`           | Sim         | Token de autenticação GitLab (PRIVATE-TOKEN)                            |
| `GIT_BASE_URL`        | Sim         | URL base do GitLab (ex: `https://gitlab.seusite.com`)                   |
| `GITHUB_TOKEN`        | Condicional | Token GitHub (necessário se usar provedor GitHub)                       |
| `GITHUB_API_URL`      | Não         | URL da API GitHub (padrão: `https://api.github.com`)                    |
| `JIRA_BASE_URL`       | Condicional | URL base do Jira (necessário para resultados)                           |
| `JIRA_PERSONAL_TOKEN` | Condicional | Token pessoal Jira                                                      |
| `XRAY_BASE_URL`       | Condicional | URL base Xray                                                           |
| `LLM_API_KEY`         | Condicional | API key do provedor LLM **main** (necessário para análise IA de falhas) |
| `LLM_FAST_API_KEY`    | Não         | API key do tier **fast** (PR description, test impact)                  |
| `LLM_SMALL_API_KEY`   | Não         | API key do tier **small** (tarefas leves — fallback para main)          |
| `QA_TOOLS_LOGS_DIR`   | Não         | Sobrescreve `LOG_DIR` para diretório de logs                            |

> Consulte [`docs/06-env-vars.md`](06-env-vars.md) para a tabela completa de todas as 16 variáveis LLM.

---

## 13. Comparar execuções (Opção `c`)

Gera relatório comparando as duas execuções mais recentes do projeto via LLM. O resultado é exibido no terminal.

### Fluxo

1. Carrega métricas do projeto atual (`loadMetrics()`)
2. Valida mínimo de **2 execuções** registradas
3. Envia os dados para IA via `compareRuns()`
4. Exibe a análise comparativa

**Arquivo:** `shared/run-comparison.ts`

---

## 14. Pipeline Health (Opção `p`)

Gera um dashboard HTML com a saúde consolidada do pipeline — métricas agregadas de todas as execuções do projeto.

### Fluxo

1. Carrega métricas e chama `aggregatePipelineHealth()`
2. Gera HTML via `generatePipelineHealthHtml()`
3. Salva e abre no navegador

**Arquivo:** `git_triggers/batch-mode.ts` — `handlePipelineHealth()`

---

## 15. Quality Gate (Opção `q`)

Exibe o Quality Gate do projeto — verifica se pass rate, flaky rate, cobertura e velocidade estão dentro dos thresholds.

| Métrica         | Threshold |
| --------------- | --------: |
| Pass rate mín.  |       80% |
| Flaky rate máx. |       30% |
| Cobertura mín.  |       70% |
| Velocidade máx. |   8s/test |

**Arquivo:** `shared/quality-gate.ts` — `runQualityGate()`

---

## 16. Bug Report Interativo (Opção `g`)

Cria Bug Reports no Jira com auxílio de IA. Descreva o bug em linguagem natural; o sistema gera e cria a issue automaticamente.

### Pré-requisitos

`JIRA_BASE_URL`, `JIRA_PERSONAL_TOKEN`, `JIRA_PROJECT` configurados.

### Fluxo

1. Verifica configuração Jira
2. Pergunta detalhes do bug (título, descrição, componente)
3. Opcional: enriquece com IA
4. Cria a issue no Jira via `interactiveBugReportFlow()`

**Arquivo:** `shared/bug-report.ts`

---

## 17. AI PR Description (Opção `i`)

Gera descrição de PR/MR a partir do diff entre branches usando IA (tier **fast**). Diferente da opção 4 (que gera durante o fluxo de criação), esta é **standalone** — apenas gera a descrição, sem criar o MR.

### Fluxo

1. Solicita branch de origem e destino
2. Obtém o diff via `getDiff()`
3. Envia para LLM via `generatePrDescription()`
4. Exibe a descrição gerada

**Arquivo:** `git_triggers/ai-pr-desc.ts`

---

## 18. Dashboards Individuais (Opção `d`)

Submenu interativo com **17 dashboards HTML**. Cada um abre no navegador com dados do projeto atual.

| #   | Dashboard             | Fonte de dados                     |
| --- | --------------------- | ---------------------------------- |
| 1   | Release Score         | Métricas + health score            |
| 2   | Defect Trends         | Classificação de falhas            |
| 3   | Traceability Matrix   | Métricas (épicos × testes)         |
| 4   | AI Effectiveness      | Registros de IA                    |
| 5   | Defect Seasonality    | Classificação de falhas            |
| 6   | Silent Regression     | Duração dos testes                 |
| 7   | AI Test Comparison    | Registros de IA                    |
| 8   | Cross-Squad Benchmark | Todos os projetos                  |
| 9   | Developer Profile     | Classificação de falhas            |
| 10  | Suite Optimization    | Duração/flakiness dos testes       |
| 11  | Backlog Health        | —                                  |
| 12  | Incident Report       | Health + regressão + sazonalidade  |
| 13  | Pipeline Cost         | Execuções (custo por minuto)       |
| 14  | Pipeline Impact Alert | Pass rate + falhas + cobertura     |
| 15  | Requirement Score     | —                                  |
| 16  | Quality Gate          | Config thresholds                  |
| 17  | Coverage Gap          | Jira (requer `JIRA_*` configurado) |

**Arquivo:** `git_triggers/interactive-mode.ts`

---

## 19. Relatório Completo de Qualidade (Opção `r`)

Gera um **HTML único** com todos os 16 dashboards acima em uma página, via `generateWeeklyQualityReport()`.

### Diferença para a opção `d`

|            | `d` (individuais)   | `r` (completo)            |
| ---------- | ------------------- | ------------------------- |
| Escopo     | 1 dashboard por vez | Todos os 16 em uma página |
| Navegação  | Submenu interativo  | Abre direto               |
| Uso típico | Investigação focada | Visão geral semanal       |

**Arquivo:** `git_triggers/schedule-handler.ts`

---

## 20. Auto-Triage Toggle (Opção `t`)

Alterna a criação automática de bugs Jira para novas falhas. O estado dura apenas a sessão atual.

| Estado     | Comportamento                                |
| ---------- | -------------------------------------------- |
| Ativado    | Bugs criados automaticamente                 |
| Desativado | Usuário é perguntado antes de criar cada bug |

Para persistir entre sessões: `QA_AUTO_BUG=true` no `.env`.

**Arquivo:** `git_triggers/interactive-mode.ts`

---

## 21. Git Metrics Adapter (Opção `e`)

Exibe informações sobre o adaptador que gera métricas sintéticas a partir do histórico Git quando não há pipelines (menos de 2 execuções).

| Função                                | O que gera                         |
| ------------------------------------- | ---------------------------------- |
| `generateGitMetricsRuns()`            | Execuções simuladas do git history |
| `generateGitFailureClassifications()` | Classificação de falhas simuladas  |

**Arquivo:** `shared/git-metrics-adapter.ts`

---

← [Voltar ao README](../README.md) | [Config Files](07-config-files.md) | [Env Vars](06-env-vars.md)
