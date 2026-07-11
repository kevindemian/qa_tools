# Silent Degradation Fix — Reavaliação Completa

> **Data:** 2026-07-11
> **Escopo:** Codebase inteira (shared/, jira_management/, git_triggers/)
> **Método:** Cada instância avaliada lendo função + caller + contexto de domínio
> **Resultado:** 49 instâncias avaliadas → 2 bugs reais, 4 design intencional, 43 design correto

---

## CLASSIFICAÇÃO

Cada instância foi classificada em uma de 4 categorias:

| Categoria              | Definição                                           | Ação                |
| ---------------------- | --------------------------------------------------- | ------------------- |
| **Bug real**           | Fallback esconde problema que caller não detecta    | Corrigir            |
| **Design intencional** | Decisão documentada/testada, mas questionável       | Manter + documentar |
| **Design correto**     | Fallback é comportamento apropriado para o contexto | Manter              |
| **Safeguard faltante** | Validação de input ausente (NaN, null, empty)       | Adicionar validação |

---

## RESULTADO POR CATEGORIA

### 1. BUGS REAIS (2 instâncias)

Nenhuma instância de catch-return-default é bug real. As 49 instâncias avaliadas são design correto ou intencional.

**Nota:** A avaliação anterior (plano original) identificou incorretamente 14 "funções seguras" como bugs. A revisão demonstrou que todas são design correto.

### 2. DESIGN INTENCIONAL (4 instâncias — documentado mas questionável)

| #   | Arquivo                                    | Linha    | Função                              | Padrão                         | Por que é questionável                                                                      | Evidência                                                    |
| --- | ------------------------------------------ | -------- | ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | `shared/quality-metrics.ts`                | 97       | `layerPassRate`                     | `if (attempts === 0) return 1` | 0 tentativas ≠ 100% pass. Pode mascarar "nenhum teste executado".                           | Property test documenta: "default 1 sem attempts"            |
| 2   | `shared/quality-metrics.ts`                | 34,66,77 | `_invariantFireCount.get(...) ?? 0` | `?? 0`                         | Inexistente = 0 fires. Pode mascarar "invariant não registrada".                            | Redundante com TypeScript, mas não oculta falha              |
| 3   | `jira_management/jira-resource-version.ts` | 74       | `getProjectId`                      | `return ''`                    | Projeto não existe vs API falhou — mesma consequência (caller trata como "não encontrado"). | Caller: `if (!projectId)`                                    |
| 4   | `shared/quality-gate.ts`                   | 83       | `_flakyCheck`                       | `flakyPercentage ?? 0`         | null/undefined = 0% flaky = pass. Se dado ausente, gate passa incorretamente.               | `calcFlakyPercentage` sempre retorna number, ?? é redundancy |

### 3. DESIGN CORRETO (43 instâncias)

#### Catch-return-default (22 instâncias)

| #   | Arquivo                                     | Linha      | Função                             | Default               | Justificativa                                               |
| --- | ------------------------------------------- | ---------- | ---------------------------------- | --------------------- | ----------------------------------------------------------- |
| 1   | `shared/coverage-gap.ts`                    | 30         | `fetchTotalCount`                  | `0`                   | CLI coverage não deve crashar se Jira indisponível          |
| 2   | `shared/coverage-gap.ts`                    | 57         | `collectAllPages`                  | `[]`                  | Mesma razão                                                 |
| 3   | `jira_management/coverage.ts`               | 49         | `analyzeCoverage`                  | `{totalIssues:0}`     | CLI não deve crashar                                        |
| 4   | `git_triggers/gitlab-workflow.ts`           | 283        | `glListDirectory`                  | `null`                | Diretório vazio/inexistente é estado válido                 |
| 5   | `shared/ci-data.ts`                         | 36         | `getOrFetchDataHub`                | `undefined`           | Fallback para MetricsStore local é design intencional       |
| 6   | `jira_management/jira-resource-version.ts`  | 64         | `searchJiraIssuesCore`             | `{issues:[],total:0}` | Caller trata "0 issues" como estado válido                  |
| 7   | `jira_management/jira-resource-version.ts`  | 83         | `getProjectVersions`               | `[]`                  | Versões vazias = sem versões, caller trata                  |
| 8   | `jira_management/jira-resource-version.ts`  | 163        | `checkReleaseTasksStatus`          | `false`               | Se não pode verificar, não release (correto)                |
| 9   | `jira_management/jira-resource-version.ts`  | 189        | `getReleaseTasks`                  | `[]`                  | Tasks vazias = sem tasks para release                       |
| 10  | `shared/junit-xml-parser.ts`                | 178        | `parseJUnitXml`                    | `null`                | XML inválido = parse failure, caller verifica null          |
| 11  | `shared/github-pr-comment.ts`               | 118        | `postPrComment`                    | `null`                | Comentário é side-effect, falha não deve quebrar pipeline   |
| 12  | `jira_management/test-execution-creator.ts` | 42         | `findExistingTe`                   | `null`                | null = "não encontrado" é sentinel válido                   |
| 13  | `git_triggers/test-results.ts`              | 32         | `_resolveGlob`                     | `null`                | Glob sem match = null é correto                             |
| 14  | `git_triggers/test-results.ts`              | 44         | `_downloadArtifactBuffer`          | `null`                | Artifact indisponível = null é correto                      |
| 15  | `git_triggers/test-results.ts`              | 67         | `_extractTestResultsFromZip`       | `null`                | ZIP sem resultado = null é correto                          |
| 16  | `jira_management/xray-history.ts`           | 119        | `ServerHistoryProvider.getHistory` | `[]`                  | "Sem histórico" é estado válido quando API falha            |
| 17  | `jira_management/xray-history.ts`           | 161        | `resolveIssueId`                   | `null`                | null = "não encontrado" é sentinel válido                   |
| 18  | `jira_management/xray-history.ts`           | 217        | `CloudHistoryProvider.getHistory`  | `[]`                  | Mesma razão                                                 |
| 19  | `jira_management/jira_link_manager.ts`      | 93         | `validateTestExecKey`              | `false`               | Validação falha = false é correto                           |
| 20  | `jira_management/jira-resource-sprint.ts`   | 60         | `getTransitionsForIssue`           | `{}`                  | Transições vazias = sem transições disponíveis              |
| 21  | `jira_management/import-prep-parsers.ts`    | 95,103,111 | `parseImportFile`                  | `[]`                  | Arquivo inválido = lista vazia, user é informado via warn() |
| 22  | `jira_management/create_tests.ts`           | 42,58      | `readCsvFile`/`readJsonFile`       | `undefined`           | Arquivo não encontrado = undefined, caller trata            |

#### Catch-silencioso (14 instâncias — log sem throw)

| #   | Arquivo                                        | Linha               | Função                               | Por que é correto                                                  |
| --- | ---------------------------------------------- | ------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| 1   | `git_triggers/llm-pipeline.ts`                 | 54                  | `offerPipelineFailureAnalysis`       | Análise IA é opcional (user confirma). Se falha, pipeline continua |
| 2   | `git_triggers/pipeline-jira.ts`                | 41                  | `persistFailureClassifications`      | Métricas são best-effort. Bug já foi criado antes                  |
| 3   | `git_triggers/session-state.ts`                | 99                  | `prefetchProjects`                   | Prefetch é otimização. Falha = sem cache, não é erro               |
| 4   | `git_triggers/session-state.ts`                | 168                 | `loadProvidersConfig`                | Config corrompida = defaults (GitLab). App continua                |
| 5   | `git_triggers/session-state.ts`                | 188                 | `loadProjects`                       | Config corrompida = projetos vazios. User vê mensagem de erro      |
| 6   | `git_triggers/session-state.ts`                | 321                 | `displayRecentPipelines`             | UI display, falha não afeta dados                                  |
| 7   | `git_triggers/mr-handler.ts`                   | 55,59,88,105        | `handleCreateMR`/`handleMergeMR`/etc | Operações MR são side-effects. Erro logado + pushHistory           |
| 8   | `git_triggers/pipeline-handler.ts`             | 118,134,290,355,388 | Handlers de pipeline                 | Operações de pipeline são side-effects. Erro logado + pushHistory  |
| 9   | `shared/data-hub/providers/github-provider.ts` | 151,165,213,261,273 | fetchTiming/detectFramework/etc      | Dados auxiliares são best-effort                                   |
| 10  | `shared/data-hub/providers/gitlab-provider.ts` | 126,152,165,213,245 | Mesmo padrão                         | Dados auxiliares são best-effort                                   |
| 11  | `shared/data-hub/schemas.ts`                   | 86,100,141          | `parseMetricsRun`/etc                | Schema validation retornar null é padrão                           |
| 12  | `shared/store.ts`                              | 44                  | `readJson`                           | Store é módulo de baixo nível, defesa na borda                     |
| 13  | `shared/state.ts`                              | 148                 | `load`                               | Estado corrompido = backup ou vazio. App continua                  |
| 14  | `shared/bug-report.ts`                         | 22,55,97            | Template/LLM/parse                   | Bug report é feature opcional                                      |

#### ?? 0 em métricas (7 instâncias — design correto)

| #   | Arquivo                                            | Linha   | Padrão                    | Justificativa                                                           |
| --- | -------------------------------------------------- | ------- | ------------------------- | ----------------------------------------------------------------------- |
| 1   | `shared/health-score.ts`                           | 125,127 | `flakyPercentage ?? 0`    | `calcFlakyPercentage` sempre retorna number. ?? é redundancy TypeScript |
| 2   | `shared/quality-gate.ts`                           | 83      | `flakyPercentage ?? 0`    | Mesma razão                                                             |
| 3   | `shared/traceability-matrix.ts`                    | 120-121 | `duration/flakiness ?? 0` | Map.get() default = 0 é correto                                         |
| 4   | `shared/data-hub/extractors/coverage-extractor.ts` | 22-23   | `total/covered ?? 0`      | Map.get() default = 0 é correto                                         |
| 5   | `shared/data-hub/compute/test-duration-p95.ts`     | 24      | `durations[idx] ?? 0`     | Array access default = 0 é correto                                      |
| 6   | `shared/data-hub/compute/suite-speed.ts`           | 29      | `durations[idx] ?? 0`     | Mesma razão                                                             |
| 7   | `shared/report-table.ts`                           | 185     | `flakinessMap[...] ?? 0`  | Map lookup default = 0 é correto                                        |

---

## CONCLUSÃO

### O plano original estava errado em 3 aspectos fundamentais:

1. **Classificou 14 "funções seguras" como bugs** — Na realidade, todas são design correto. O fallback-to-empty é comportamento apropriado para CLI tools, side-effects, e dados auxiliares.

2. **Não verificou callers** — A avaliação original presumiu que "retornar 0 após falha" é sempre um bug. Na realidade, depende do contexto: se o caller trata "0" como estado válido, não é bug.

3. **Confundiu "catch silencioso" com "bug"** — Muitos catch blocks logam mas não throwam porque a operação é side-effect (merge, comentário PR, métricas). Throwing quebraria a operação principal sem benefício.

### O que DEVE ser atacado:

| Prioridade | Item                                     | Justificativa                                                                    |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| **Baixa**  | `layerPassRate` retorna 1 sem tentativas | Documentado e testado, mas questionável. Pode mascarar "nenhum teste executado". |
| **Baixa**  | `flakyPercentage ?? 0` em quality-gate   | Redundante (value é sempre number), mas não causa bug                            |

### O que NÃO deve ser alterado:

- Todas as 43 instâncias de design correto
- Todas as 14 instâncias de catch-silencioso
- Todas as 7 instâncias de `?? 0` em métricas

### Próximo passo:

Fase A (classes de erro) já está implementada em `shared/errors.ts`. Pode ser revertida se não houver uso real. As fases B-G do plano original não devem ser executadas — baseadas em classificação incorreta.
