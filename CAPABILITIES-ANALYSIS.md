# Análise de Capacidades — QA Tools

> ⚠️ **DOCUMENTO HISTÓRICO.** A análise aqui contida foi integralmente implementada (Sprints V1-V5, Sprints 10-12). Consulte `BACKLOG.md` para o estado atual das features.
> **Propósito:** Mapear o valor real e oculto do produto a partir das capacidades já existentes, sem assumir novos desenvolvimento s.
> **Premissa:** Nenhum novo conector será criado nos próximos 12 meses.
> **Método:** Análise de capacidades (não funcionalidades), correlações, sinergias e gaps de exploração.

---

## 1. INVENTÁRIO DE CAPACIDADES REAIS

### 1.1 Capacidades de Coleta

| Capacidade                      | O que coleta                                                                                  | Fonte                              | Como                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| Coleta de resultados de teste   | Nome do teste, status (passed/failed/skipped/error), duração, erro/mensagem, suite, fullTitle | CTRF, Mochawesome, JUnit XML       | `result_parser.ts` parser multi-formato    |
| Coleta de pipeline CI           | Workflows, runs, jobs, status, duração, logs de erro, artifacts                               | GitHub Actions API, GitLab CI API  | `github_manager.ts`, `gitlab_manager.ts`   |
| Coleta de issues Jira           | Chave, resumo, tipo, status, prioridade, epic, assignee, links, sprints, fixVersions          | Jira REST API                      | `jira_resource.ts` search + get            |
| Coleta de testes Xray           | Steps, pre-conditions, históricos de execução, tipos de link                                  | Xray REST + GraphQL                | `xray-client.ts`, `xray-history.ts`        |
| Coleta de cobertura             | Issues cobertas por teste, gaps, hierarquia Epic→Story/Task/Bug                               | Jira issuelinks                    | `coverage-gap.ts`, `coverage-gap-utils.ts` |
| Coleta de métricas de LLM       | Requisições, falhas por tier, cache hits/misses, tokens, latência, confiança                  | Em memória + persistência em disco | `llm-metrics.ts`                           |
| Coleta de feedback de geração   | Registros de geração, modificações, taxa de aceitação                                         | Disco                              | `ai-feedback.ts`                           |
| Coleta de estado de sessão      | Contadores de sessão (ok/error), breadcrumbs de navegação                                     | Em memória                         | `session-context.ts`, `breadcrumbs.ts`     |
| Coleta de diffs git             | Arquivos modificados, linhas adicionadas/removidas                                            | Git CLI                            | `test-impact.ts`, `ai-test-impact.ts`      |
| Coleta de código (package.json) | Dependências, devDependencies, scripts                                                        | Leitura de arquivo                 | `test-impact.ts`                           |

### 1.2 Capacidades de Correlação

| Correlação                                  | Mecanismo                                                                                                       | Profundidade |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------ |
| Resultado de teste ↔ Issue Jira             | Fuzzy matching (exato, substring, alfanumérico normalizado) entre título do teste e chave Jira via mapping JSON | ⭐⭐⭐       |
| Pipeline CI ↔ Artefatos ↔ Resultados ↔ Jira | Download de artefato → parse → match → criação/atualização de Test Execution + issue links                      | ⭐⭐⭐       |
| Falha de teste ↔ Commits git                | Contexto opcional gitCommits + gitTrend + jiraIssues enviado ao LLM para análise de causa raiz                  | ⭐⭐         |
| Código alterado ↔ Testes impactados         | 3 tiers: `jest --findRelatedTests`, keyword matching, mapping explícito; confiança high/medium/low              | ⭐⭐⭐       |
| Código alterado ↔ Descrição de PR           | LLM analisa diff e gera descrição em português destacando riscos                                                | ⭐⭐         |
| Pre-conditions ↔ Test cases                 | Jaccard token overlap + dual-threshold assimétrico (0.5 admissão, 0.7 confirmação)                              | ⭐⭐⭐       |
| Test cases ↔ Requisitos (linked issues)     | Issue links Jira entre test case e linkedIssues (stories, requirements)                                         | ⭐⭐⭐       |
| Testes em grupo ↔ Cross-references          | Descrição de cada teste menciona chaves dos testes irmãos no mesmo grupo                                        | ⭐⭐         |
| Pipeline runs ↔ Falhas ↔ Categorias         | Agregação de conclusões, status de jobs, mensagens de erro, issues do GitHub                                    | ⭐⭐⭐       |
| Testes ↔ Histórico Xray                     | REST/GraphQL busca execuções passadas por chave do teste; cache TTL                                             | ⭐⭐         |
| Epic ↔ Issues ↔ Cobertura                   | Hierarquia Epic→Story/Task/Bug com linked tests, rollup de cobertura ponderada                                  | ⭐⭐⭐       |
| Bugs ↔ Falhas de teste                      | BugReport criado de ParseResult (automático) ou enrichment LLM (manual)                                         | ⭐⭐⭐       |
| Flaky ↔ Bugs Jira                           | JQL busca bug existente "[Flaky]...", cria se não existe, quarantine                                            | ⭐⭐         |
| Rodadas ↔ Comparação entre execuções        | LLM compara mudanças entre runs (pass rate, falhas, duração, tendência)                                         | ⭐⭐         |

### 1.3 Capacidades de Inferência

| Inferência                      | O que produz                                                   | Motor                                          | Confiabilidade                                 |
| ------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Classificação de falha          | ASSERTION/TIMEOUT/ENVIRONMENT/FLAKY/APPLICATION/UNKNOWN        | Regex + LLM (`classify.md`)                    | Média (regex cobre 60%, LLM cobre ~90%)        |
| Análise de falha com causa raiz | JSON: title, classification, severity, recommendation          | LLM (`failure-analysis.md`) + adversarial loop | Alta (validação Zod + retry 3x + self-review)  |
| Health score composto           | Score 0-100, grade, qualityGate pass/fail, por dimensão        | `health-score.ts` (4 dimensões ponderadas)     | Determinística (dados históricos)              |
| Gap de cobertura                | Itens cobertos/não cobertos, por Epic, com peso por prioridade | `coverage-gap-utils.ts`                        | Determinística (dados Jira)                    |
| Impacto de teste                | Lista de testes impactados + confiança + comando               | `test-impact.ts` (3 tiers)                     | Média (tier 1 = alta, tiers 2-3 = média/baixa) |
| Risco de entrega                | BAIXO/MEDIO/ALTO via LLM                                       | `ai-test-impact.ts`                            | Média (LLM + contexto limitado)                |
| Tendência de qualidade          | Pass rate ao longo do tempo, trend chart SVG                   | `metrics.ts` + `report-chart.ts`               | Determinística                                 |
| Flakiness                       | Taxa por teste, windowed, threshold configurável               | `metrics.ts` + `flaky-auto-actions.ts`         | Determinística                                 |
| Qualidade de geração AI         | Taxa de aceitação (kept vs modified), por versão de prompt     | `ai-feedback.ts`                               | Determinística                                 |
| Categoria de falha de pipeline  | infrastructure/code/flaky/unknown                              | LLM (`classify-pipeline-failure.md`)           | Média                                          |
| Maturação de release            | Tarefas concluídas vs pendentes por versão                     | `jira_resource.ts` `checkReleaseTasksStatus()` | Determinística                                 |

### 1.4 Capacidades de Automação

| Automação                     | Gatilho                                                 | O que executa                                |
| ----------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| Criação de bugs flaky         | Detecção de flakiness acima do threshold                | Cria bug Jira, adiciona à quarentena         |
| Reativação de teste estável   | Flaky rate abaixo do threshold por N rodadas            | Fecha bug, remove da quarentena              |
| Geração de PR description     | Comando `qa pr`                                         | Gera descrição via LLM + posta no GitHub     |
| Criação de Test Execution     | Pipeline CI completa                                    | Match resultados → mapping → criação TE Jira |
| Criação de pre-conditions     | LLM gera summary → match duplo threshold → cria se novo | Cria + associa ao test case                  |
| Exportação de variáveis CI/CD | Comando                                                 | Lê do provider + exporta para uso local      |
| Comparação de runs            | Comando                                                 | LLM compara duas métricas runs               |
| Benchmarks LLM                | Comando                                                 | Executa golden dataset, reporta match rate   |
| Snapshot de métricas          | Automático (pós-operação)                               | Persiste métricas de LLM + coverage          |
| Wizard de configuração        | Primeiro uso / comando 'w'                              | Configura projetos, tokens, CI/CD            |

### 1.5 Capacidades de Geração de Conhecimento

| Saída                    | Formato                  | Consumidor               |
| ------------------------ | ------------------------ | ------------------------ |
| HTML Report              | HTML auto-contido        | Humanos (engenharia, QA) |
| Coverage Gap Report      | HTML auto-contido        | QA Leads, Gerentes       |
| Pipeline Health Report   | HTML auto-contido        | SREs, Tech Leads         |
| Flakiness Dashboard      | HTML auto-contido        | QA, Desenvolvedores      |
| Test Selection JSON      | JSON                     | Pipeline CI              |
| Pipeline Quarantine JSON | JSON                     | Pipeline CI              |
| Mapping JSON             | JSON                     | Result reporter, CI      |
| Jira Issues              | Markdown → REST API      | Jira                     |
| LLM Metrics Snapshots    | JSON                     | Observabilidade          |
| Bug Reports              | Markdown → Jira          | Desenvolvedores          |
| PR/MR Descriptions       | Markdown → GitHub/GitLab | Revisores                |
| Failure Analysis Report  | HTML auto-contido        | QA, Desenvolvedores      |

---

## 2. CAPACIDADES OCULTAS

Capacidades que já existem na plataforma mas aparentemente não estão sendo exploradas:

### 2.1 Rastreabilidade Bidirecional não Explorada

O sistema já correlaciona `teste ↔ requisito` (via linked issues) e `teste ↔ execução` (via Test Execution). **Não explora** a navegação reversa: dado um requisito, quais testes o cobrem, qual o health score desses testes, qual a flakiness, qual o histórico de execução.

**Dados disponíveis:** linked issues, mapping JSON, Test Execution, history Xray, flakiness.
**Capacidade latente:** "Matriz de rastreabilidade viva" — HTML navegável com requisito → testes → última execução → health → flakiness.

### 2.2 Análise de Risco de Release não Explorada

O sistema já sabe: (1) tarefas por versão (`getReleaseTasks`), (2) cobertura de testes por Epic, (3) flakiness por teste, (4) health score composto. **Não combina** essas 4 fontes em um "Release Readiness Dashboard".

**Dados disponíveis:** `checkReleaseTasksStatus`, `analyzeCoverageGaps`, `calculateHealthScore`, `calculateFlakiness`.
**Capacidade latente:** Dashboard único que responde "Esta release está pronta?" com base em: tasks concluídas + cobertura + flakiness + health score + tendência.

### 2.3 Perfil de Desenvolvedor/Equipe não Extraído

O sistema sabe quem criou issues (assignee), quem aprovou PRs, quem comitou. **Não extrai** métricas de qualidade por desenvolvedor/equipe: taxas de falha, tipos de defeito mais comuns, tempo médio de resolução.

**Dados disponíveis:** GitHub PR reviews + Jira assignee/status/dates.
**Capacidade latente:** "Perfil de qualidade por time" — correlação entre autor de mudança e falhas introduzidas.

### 2.4 Análise de Estabilidade de Suite não Explorada

O sistema já coleta duração por teste e por suite. **Não analisa** tendências de duração (testes que estão ficando mais lentos), nem detecta testes que degradam performance.

**Dados disponíveis:** `MetricsRun.tests[].duration` + histórico.
**Capacidade latente:** "Degradation detection" — alerta quando um teste fica >2σ acima da média histórica de duração.

### 2.5 Análise de Qualidade de Requisitos não Explorada

O sistema já recebe user stories e gera testes via LLM. **Não avalia** a qualidade intrínseca do requisito: ambiguidade, completude, testabilidade.

**Dados disponíveis:** prompt `user-story-to-tests.md` + LLM adversarial audit + feedback de modificação.
**Capacidade latente:** "Requirement quality score" — LLM analisa user story e métrica quão bem ela se presta à geração de testes.

### 2.6 Correlação Pipeline ↔ Cobertura não Explorada

O sistema coleta pipelines e cobertura. **Não cruza** "build quebrou → qual a cobertura das áreas afetadas no diff?".

**Dados disponíveis:** git diff (commit do pipeline) + coverage gap por Epic + linked tests.
**Capacidade latente:** "Impact-aware pipeline analysis" — quando um pipeline falha, aponta quais epics estão em risco dado o diff + cobertura.

### 2.7 Análise de Maturação de Teste Automatizado

O sistema tem feedback de geração AI (`ai-feedback.ts`). **Não correlaciona** com execução real: "testes gerados por AI têm maior/menor taxa de falha que testes manuais?".

**Dados disponíveis:** `ai-feedback.json` (promptVersion, generatedTests, modifications) + `metrics.json` (execution results).
**Capacidade latente:** "AI test effectiveness analysis" — compara taxa de falha, flakiness e duração entre AI-generated e manual tests.

### 2.8 Detecção de Regressão Silenciosa

O sistema compara runs (`compareRuns`). **Não detecta** testes que passam mas mudaram de comportamento (ex: teste que passava em 200ms e agora passa em 2s, ou teste que estava cobrindo X cenários e agora só 1).

**Dados disponíveis:** diffs entre runs + duration history.
**Capacidade latente:** "Silent regression detector" — alerta para mudanças significativas em duração ou comportamento sem mudança de status.

### 2.9 Análise de Carga Cognitiva de Suite

O sistema tem a duração total da suite. **Não mede** quantos testes são redundantes, quanto tempo é perdido executando testes óbvios, qual o custo de execução por dólar de CI.

**Dados disponíveis:** `FlatTest[].duration`, `MetricsRun.duration`, pipelines com custo.
**Capacidade latente:** "Suite optimization analysis" — sugere quais testes mover para tier mais rápido, quais remover, quais juntar.

### 2.10 Sazonalidade de Defeitos

O sistema tem histórico de execução. **Não analisa** padrões temporais: "mais falhas na sexta?", "mais falhas pós-deploy de quarta?", "tendência mensal".

**Dados disponíveis:** `MetricsRun` timestamp + pipieline runs.
**Capacidade latente:** "Defect seasonality" — correlação temporal de falhas com dias da semana, horários, ciclos de release.

---

## 3. CASOS DE USO NÃO ÓBVIOS

### 3.1 Test Impact Analysis — Uso Avançado

| Aspecto              | Detalhe                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Uso original**     | Selecionar quais testes rodar em um PR específico                                                           |
| **Uso avançado**     | Gerar `test-selection.json` e integrar no pipeline CI como `jest --selectProjects` ou filtro por test match |
| **Uso não previsto** | Associar o diff com o mapping de coverage — "estes arquivos mudaram, que epics/requisitos estão em risco?"  |
| **Valor**            | Reduz feedback loop de CI em 40-70% (só roda testes relevantes) + alerta de risco de regressão              |

### 3.2 Pre-condition Matching — Uso Avançado

| Aspecto              | Detalhe                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Uso original**     | Evitar duplicação de pre-conditions ao gerar testes via LLM                                                       |
| **Uso avançado**     | Catálogo pesquisável de pre-conditions existentes, sugestão de reúso                                              |
| **Uso não previsto** | Reengenharia reversa: dado um conjunto de testes, inferir quais pre-conditions estão implícitas e sugerir criação |
| **Valor**            | Elimina retrabalho de setup, padroniza ambiente de teste                                                          |

### 3.3 Pipeline Health — Uso Avançado

| Aspecto              | Detalhe                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Uso original**     | Relatório de saúde do pipeline                                                                                                                     |
| **Uso avançado**     | Correlacionar falhas de pipeline com deploys, releases, mudanças de configuração                                                                   |
| **Uso não previsto** | Usar `failureByCategory` + `classify-pipeline-failure.md` para gerar "custo de downtime" — quanto tempo/$$ cada categoria de falha consumiu no mês |
| **Valor**            | Justifica investimento em infraestrutura vs qualidade de código                                                                                    |

### 3.4 Comparison Runner — Uso Avançado

| Aspecto              | Detalhe                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **Uso original**     | Comparar duas runs                                                                              |
| **Uso avançado**     | Comparar runs antes/depois de deploy para detectar regressão introduzida                        |
| **Uso não previsto** | Feed contínuo: comparar cada run com a média das últimas N runs e alertar se pass rate caiu >5% |
| **Valor**            | Detecção precoce de regressão sem necessidade de análise manual                                 |

### 3.5 LLM Benchmark — Uso Avançado

| Aspecto              | Detalhe                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| **Uso original**     | Validar qualidade das inferências LLM                                               |
| **Uso avançado**     | Detectar regressão de prompt — se benchmark piorou após mudança de prompt, reverter |
| **Uso não previsto** | Benchmark como CI gate: pipeline falha se benchmark cai abaixo de threshold         |
| **Valor**            | Garantia de qualidade contínua das capacidades de LLM                               |

---

## 4. SINERGIAS

### 4.1 Jira + Xray

| Capacidade emergente                             | Mecanismo                                                              | Valor                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------- |
| **Rastreabilidade requisito → teste → execução** | Linked issues (requisito ↔ teste) + Test Execution (teste ↔ resultado) | Rastreabilidade ponta a ponta sem planilhas |
| **Cobertura de requisitos por Epic**             | Issues → linked tests → Xray history                                   | Visão gerencial de cobertura                |
| **Qualidade de release por Epic**                | Epic coverage + health score + test history                            | Decisão de go/no-go baseada em dados        |

### 4.2 Jira + GitHub/GitLab

| Capacidade emergente          | Mecanismo                                               | Valor                                        |
| ----------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| **PR → Issues afetadas**      | AI PR description cita issues Jira relevantes           | Revisão de código com contexto de requisitos |
| **Pipeline → Release health** | Pipeline failure + release tasks status                 | Pipeline quebra? Sabe se afeta release       |
| **Commit → Bug fix rate**     | Commits que fecham bugs Jira → tempo médio de resolução | Métrica de eficiência de engenharia          |

### 4.3 Xray + GitHub/GitLab

| Capacidade emergente                        | Mecanismo                                           | Valor                                       |
| ------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| **Test results → Jira automático**          | Pipeline → artifacts → parser → match → TE creation | Zero esforço manual para reportar resultado |
| **Flaky detection → Auto-bug → Quarantine** | Flaky rate → bug creation → quarantine              | Gestão autônoma de testes instáveis         |
| **CI gate por cobertura Xray**              | Coverage gap check no pipeline                      | Pipeline falha se cobertura caiu            |

### 4.4 Jira + Xray + GitHub/GitLab (integral)

| Capacidade emergente                    | Mecanismo                                                                          | Valor                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| **Matriz de rastreabilidade viva**      | Requisito (Jira) → Teste (Xray) → Execução (CI) → Resultado (GitHub/Jira)          | Rastreabilidade completa sem esforço manual |
| **Quality gate baseado em 3 dimensões** | Cobertura (Jira+Xray) + Flakiness (CI history) + Health Score (composto)           | Decisão de merge objetiva                   |
| **Release readiness score**             | % tasks concluídas (Jira) × coverage (Xray) × pass rate (CI) × flakiness (history) | Score único: "Pode fazer release?"          |

### 4.5 Todas as integrações + LLM

| Capacidade emergente                               | Mecanismo                                                                                        | Valor                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ |
| **Failure root cause analysis com contexto total** | LLM recebe: falha + git diff + commits + issues Jira relacionadas + pipeline logs                | Causa raiz em minutos, não horas     |
| **Test generation contextual**                     | LLM gera testes baseado em: user story (Jira) + código existente (git) + testes similares (Xray) | Testes que refletem arquitetura real |
| **PR review aumentado**                            | LLM analisa: diff + testes impactados + cobertura das áreas + histórico de falhas                | Review com contexto de qualidade     |
| **Detecção de anomalia cross-source**              | LLM correlaciona: falha de pipeline + aumento de duration + deploy recente + issue relacionada   | Detecção de causa raiz não óbvia     |

---

## 5. OPORTUNIDADES PARA QA

### 5.1 Análise de Requisitos

- **Já disponível:** LLM gera testes a partir de user story
- **Oportunidade extra:** Usar `ai-feedback.ts` para medir "testabilidade do requisito" — requisitos que geram muitos testes modificados pelo humano são mal escritos
- **Sem código novo:** Dashboard HTML com taxa de modificação por promptVersion + história

### 5.2 Planejamento de Testes

- **Já disponível:** `test-impact.ts` seleciona testes por diff
- **Oportunidade extra:** Planejamento baseado em risco: testar mais áreas com baixa cobertura + alto impacto de negócio (prioridade P0/P1)
- **Sem código novo:** Correlacionar `coverage-gap.ts` (cobertura por Epic) com `getCoverageWeight()` (peso por prioridade)

### 5.3 Cobertura de Testes

- **Já disponível:** `analyzeCoverageGaps()` com hierarquia Epic e peso por prioridade
- **Oportunidade extra:** "Cobertura por tipo de issue" — bugs têm linked tests? stories têm? tasks têm?
- **Sem código novo:** Filtro no `CoverageGapResult` por issue type

### 5.4 Rastreabilidade

- **Já disponível:** Linked issues + mapping JSON + Test Execution
- **Oportunidade extra:** HTML navegável: requisito → testes → execuções → health → flakiness
- **Sem código novo:** `report-html.ts` + `report-table.ts` renderizam dados similares; reutilizar componentes

### 5.5 Detecção de Gaps

- **Já disponível:** `CoverageGapResult` com gaps por Epic
- **Oportunidade extra:** "Gap de regressão" — testes que passavam e passaram a falhar sem mudança de código (flaky detection já existe)
- **Sem código novo:** Correlacionar `compareRuns` + `calculateFlakiness` em painel único

### 5.6 Análise de Defeitos

- **Já disponível:** `classifyFailure()` + `failure-analysis.md` + bug report automático
- **Oportunidade extra:** "Mapa de defeitos por funcionalidade" — Epic → testes falhando → classificação LLM → severidade
- **Sem código novo:** HTML report já tem LLM section; estender para grouped by Epic

### 5.7 Análise de Regressão

- **Já disponível:** `compareRuns` + diff comparison + trend chart
- **Oportunidade extra:** "Regressão por commit" — dado um commit que quebrou, quais testes quebraram exatamente? qual o diff? qual o risco?
- **Sem código novo:** Correlacionar git diff (commit) + pipeline run + test results

### 5.8 Análise de Risco

- **Já disponível:** `health-score.ts` + `quarantine.ts` + `test-impact.ts`
- **Oportunidade extra:** "Risco de release por componente" — por Epic: cobertura + flakiness + health + tasks pendentes
- **Sem código novo:** HTML combinando `CoverageGapResult` + `HealthScoreResult` + release tasks

### 5.9 Investigação de Incidentes

- **Já disponível:** `failure-analysis.ts` com LLM + git context
- **Oportunidade extra:** Ao receber um incidente (Jira issue), buscar automaticamente: testes relacionados + últimas execuções + diffs recentes + pipelines ao redor do timestamp
- **Sem código novo:** Correlacionar issue key → linked tests → history Xray → pipeline runs → git log

### 5.10 Auditoria de Qualidade

- **Já disponível:** `calculateHealthScore()` + `analyzeCoverageGaps()` + trend charts
- **Oportunidade extra:** "Auditoria programada" — relatório semanal/mensal de qualidade consolidado
- **Sem código novo:** `generateReportWithFallback()` aceita qualquer dado; criar schedule via `schedule-handler.ts`

---

## 6. OPORTUNIDADES PARA QA LEAD

### 6.1 Governança de Qualidade

- **Capacidade:** Health Score composto (pass rate + flaky + coverage + speed) com grade A-F
- **Oportunidade:** Dashboard mensal de governança com score por squad/projeto e tendência
- **Sem código novo:** HTML existente + `metrics.ts` histórico

### 6.2 Saúde do Backlog

- **Capacidade:** Dados de issues Jira (status, prioridade, épico, assignee, versão)
- **Oportunidade:** "Backlog Health Check" — issues sem assignee, issues paradas há >30d, density de bugs por Epic
- **Sem código novo:** `searchJiraIssues()` + `getReleaseTasks()` + contagem manual

### 6.3 Qualidade dos Requisitos

- **Capacidade:** AI feedback (modification rate por prompt version) + LLM adversarial audit
- **Oportunidade:** Score de "testabilidade" por requisito — requisitos que geram muitos testes editados pelo humano são ruins
- **Sem código novo:** Dashboard de `ai-feedback.ts` por promptVersion × modification rate

### 6.4 Qualidade dos Testes

- **Capacidade:** Flakiness por teste + duração + cobertura por Epic
- **Oportunidade:** "Test Maturity Matrix" — % testes automatizados, % flaky, % com history Xray, % com linked requirement
- **Sem código novo:** Correlação de métricas já coletadas

### 6.5 Qualidade das Entregas

- **Capacidade:** Release tasks status + coverage + health score + pipeline pass rate
- **Oportunidade:** Release Readiness Scorecard — score A-F por release com tendência
- **Sem código novo:** Combinar `checkReleaseTasksStatus()` + `analyzeCoverageGaps()` + `calculateHealthScore()`

### 6.6 Tendências de Defeitos

- **Capacidade:** classifyFailure() por run + histórico de runs
- **Oportunidade:** "Defect Trend by Category" — gráfico de pizza/barras: quantas ASSERTION vs TIMEOUT vs ENVIRONMENT vs FLAKY vs APPLICATION este mês
- **Sem código novo:** Aggregate `FailureAnalysisResult[]` de múltiplas runs; chart SVG já existe

### 6.7 Hotspots de Qualidade

- **Capacidade:** Agregação por Epic + cobertura + flakiness + health
- **Oportunidade:** "Quality Hotspot Map" — Epics com baixa cobertura + alta flakiness + muitos bugs
- **Sem código novo:** Correlação `CoverageGapResult.byEpic` + `calculateFlakiness()` por Epic

---

## 7. OPORTUNIDADES PARA ENGENHARIA

### 7.1 Desenvolvedores

- **Já disponível:** `test-impact.ts` → quais testes rodar antes do push
- **Oportunidade extra:** "Pre-push validation" — antes de commitar, rodar testes impactados + verificar se coverage gap não aumentou
- **Sem código novo:** `test-impact.ts` + `coverage-gap.ts` executados em pre-push hook

- **Já disponível:** `bug-report.ts` → bug report automático de testes falhando
- **Oportunidade extra:** "Auto-assign bug to committer" — dado um commit que quebrou, assignar bug ao autor do diff
- **Sem código novo:** Correlação git blame + commit que introduziu falha

### 7.2 Tech Leads

- **Já disponível:** `health-score.ts` + `coverage-gap.ts` + trend
- **Oportunidade extra:** "Architecture risk via test patterns" — testes muito longos, muitas asserções, muitos mocks indicam acoplamento
- **Sem código novo:** Análise de complexidade de testes via LLM (reutilizar `reviewWithLlm()` + prompts customizados)

- **Já disponível:** `analyzeCoverageGaps()` por Epic
- **Oportunidade extra:** "Tech debt indicator" — Epics com baixa cobertura + alta prioridade = tech debt acumulado
- **Sem código novo:** Correlação coverage + priority weight

### 7.3 Arquitetos

- **Já disponível:** Mapeamento de issues por tipo e epic + linked tests
- **Oportunidade extra:** "Module coupling via test analysis" — testes que frequentemente quebram juntos indicam acoplamento
- **Sem código novo:** Análise de co-ocorrência de falhas entre testes (dados de runs históricas)

- **Já disponível:** Xray per-test history + categorize failure
- **Oportunidade extra:** "Test architecture smell detection" — detectar testes que testam múltiplas responsabilidades, testes com setup excessivo
- **Sem código novo:** LLM analyze test steps (reutilizar `reviewWithLlm()`)

### 7.4 SREs

- **Já disponível:** `pipeline-health.ts` com `failureByCategory`
- **Oportunidade extra:** "Infrastructure health trend" — tendência de falhas de infraestrutura vs código vs flaky
- **Sem código novo:** Dashboard `failureByCategory` com tendência (chart SVG já existe)

- **Já disponível:** Job logs + error messages + latency
- **Oportunidade extra:** "Pipeline cost analytics" — duração média por pipeline, custo estimado (minutos × $/min), custo por falha (retrabalho)
- **Sem código novo:** Agregação de `PipelineHealth` com métricas de duração

---

## 8. OPORTUNIDADES DE AUTOMAÇÃO

### 8.1 Decisões Automatizáveis (sem código novo)

| Decisão                             | Dados necessários                                                  | Já disponível?       | Como automatizar                                            |
| ----------------------------------- | ------------------------------------------------------------------ | -------------------- | ----------------------------------------------------------- |
| "Este merge pode ir?"               | Health score + coverage gate + flakiness threshold + pipeline pass | ✅ Todos disponíveis | Script que avalia 4 gates e retorna pass/fail               |
| "Este PR afeta quais testes?"       | Git diff + test-impact                                             | ✅                   | `generateTestSelectionJson()` já gera output pipeline-ready |
| "Este teste é flaky?"               | Histórico de runs (metrics.json)                                   | ✅                   | `calculateFlakiness()` com threshold                        |
| "Precisa de mais testes?"           | Coverage gap por Epic                                              | ✅                   | `analyzeCoverageGaps()` retorna gaps                        |
| "Esta falha já foi classificada?"   | Histórico de failure analysis                                      | ✅                   | Match do error message com classificações passadas          |
| "Bug já existe para esta falha?"    | JQL search                                                         | ✅                   | `searchExistingBug()` em `flaky-auto-actions.ts`            |
| "Estes testes podem ser removidos?" | Testes sem linked requirement + passando sempre                    | ✅                   | Correlação linked issues + metrics history                  |
| "Esta release está pronta?"         | Tasks + coverage + health + flakiness                              | ✅                   | Score composto (já implementado para health)                |

### 8.2 Atividades Automatizáveis

| Atividade                        | Como fazer hoje                   | Automação possível                                             |
| -------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| Classificar falha de teste       | Humano analisa log                | `classifyFailure()` + `failure-analysis.md` (já existe)        |
| Criar bug report de falha        | Humano copia erro para Jira       | `bug-report.ts` `collectAutomated()` (já existe)               |
| Criar Test Execution             | Humano sobe resultados no Xray    | `test-results.ts` + `result_reporter.ts` (já existe)           |
| Analisar causa raiz de falha     | Humano investiga diff + histórico | `failure-analysis.ts` com git context (já existe)              |
| Decidir quais testes rodar em PR | Humano chuta                      | `test-impact.ts` com `generateTestSelectionJson()` (já existe) |
| Gerar descrição de PR            | Humano escreve                    | `ai-pr-desc.ts` (já existe)                                    |
| Monitorar saúde de qualidade     | Humano consulta dashboards        | Schedule `calculateHealthScore()` + gera HTML (já existe)      |

---

## 9. TOP 20 OPORTUNIDADES

Ranking por ROI técnico (valor / esforço), usando apenas capacidades existentes.

| #   | Oportunidade                                                                   | Valor                           | Esforço           | Impacto QA | Impacto Eng | Impacto Qualidade | Justificativa                                                                        |
| --- | ------------------------------------------------------------------------------ | ------------------------------- | ----------------- | ---------- | ----------- | ----------------- | ------------------------------------------------------------------------------------ |
| 1   | **CI Gate por Test Impact** — pipeline roda só testes impactados pelo diff     | Reduz feedback loop 40-70%      | Config (1h)       | ⭐⭐⭐     | ⭐⭐⭐      | ⭐⭐⭐            | `test-impact.ts` + `generateTestSelectionJson()` já prontos; só integrar no pipeline |
| 2   | **Pipeline gate composto** — health + coverage + flakiness antes do merge      | Evita regressão silenciosa      | Integração (2h)   | ⭐⭐⭐     | ⭐⭐        | ⭐⭐⭐            | Gates já implementados; só orquestrar                                                |
| 3   | **Release Readiness Dashboard** — score por release                            | Decisão go/no-go objetiva       | HTML + dados (3h) | ⭐⭐⭐     | ⭐⭐        | ⭐⭐⭐            | 4 fontes de dados já coletadas; só combinar em HTML                                  |
| 4   | **Matriz de rastreabilidade viva** — requisito → teste → execução              | Rastreabilidade sem planilhas   | HTML (4h)         | ⭐⭐⭐     | ⭐          | ⭐⭐⭐            | Dados todos presentes; `report-html.ts` reutilizável                                 |
| 5   | **Defect trend dashboard** — falhas por categoria ao longo do tempo            | Visão de tendência de qualidade | HTML (3h)         | ⭐⭐⭐     | ⭐⭐        | ⭐⭐⭐            | `classifyFailure()` runs históricas já existem                                       |
| 6   | **Pre-push validation hook** — test-impact + coverage-gate antes do commit     | Feedback imediato               | Script (1h)       | ⭐⭐       | ⭐⭐⭐      | ⭐⭐⭐            | Hooks git nativos + `test-impact.ts`                                                 |
| 7   | **Failure auto-triage** — falha → classificação → bug → assign                 | Zero delay para dev saber       | Config + JQL (2h) | ⭐⭐⭐     | ⭐⭐⭐      | ⭐⭐              | 3 funções já existentes; só encadear                                                 |
| 8   | **Quality health weekly report** — relatório semanal automático                | Governança sem esforço          | Schedule (2h)     | ⭐⭐⭐     | ⭐          | ⭐⭐⭐            | `calculateHealthScore()` + `generateReportWithFallback()`                            |
| 9   | **Flaky test trend per squad** — flakiness por Epic/equipe                     | Hotspots de instabilidade       | HTML (3h)         | ⭐⭐⭐     | ⭐⭐        | ⭐⭐⭐            | `calculateFlakiness()` + metadados Jira (assignee/epic)                              |
| 10  | **AI generation effectiveness** — taxa de aceite por promptVersion             | Melhoria contínua de prompts    | HTML (2h)         | ⭐⭐⭐     | ⭐          | ⭐⭐              | `ai-feedback.ts` já coleta; só dashboard                                             |
| 11  | **Suite speed degradation alert** — testes ficando mais lentos                 | Previne timeout creep           | Alerta (2h)       | ⭐⭐       | ⭐⭐        | ⭐⭐              | Duration history disponível; detector de anomalia                                    |
| 12  | **Bug auto-link to failing tests** — bug Jira linka testes falhando            | Rastreabilidade reversa         | JQL (1h)          | ⭐⭐⭐     | ⭐⭐        | ⭐⭐              | `linkIssues()` existe                                                                |
| 13  | **Risk-based test planning** — testar mais áreas de alto risco                 | Cobertura otimizada             | Query (2h)        | ⭐⭐⭐     | ⭐          | ⭐⭐⭐            | `getCoverageWeight()` + coverage gap                                                 |
| 14  | **Release diff report** — comparar qualidade entre versões                     | Regressão entre releases        | HTML (3h)         | ⭐⭐       | ⭐⭐        | ⭐⭐⭐            | `compareRuns()` + HTML report                                                        |
| 15  | **Pipeline cost analytics** — custo por falha, por pipeline                    | Justifica investimento          | HTML (3h)         | ⭐         | ⭐⭐        | ⭐⭐              | Pipeline duration + preço spot                                                       |
| 16  | **Backlog health dashboard** — issues sem dono, paradas, density               | Gestão de backlog               | HTML + JQL (3h)   | ⭐⭐       | ⭐⭐        | ⭐⭐              | `searchJiraIssues()` com JQL                                                         |
| 17  | **Test maturity matrix** — % auto, % flaky, % com req link                     | Métrica de evolução             | HTML (3h)         | ⭐⭐⭐     | ⭐          | ⭐⭐⭐            | Dados já dispersos; consolidar                                                       |
| 18  | **Cross-team quality benchmark** — comparar health score entre squads          | Competição saudável             | HTML (3h)         | ⭐⭐       | ⭐          | ⭐⭐              | Per-project health scores                                                            |
| 19  | **Architecture smell via test analysis** — testes que indicam acoplamento      | Dívida técnica visível          | LLM prompt (4h)   | ⭐⭐       | ⭐⭐⭐      | ⭐⭐              | `reviewWithLlm()` + prompt custom                                                    |
| 20  | **AI-driven test gap suggestion** — LLM sugere testes para áreas sem cobertura | Geração contextual              | Prompt (4h)       | ⭐⭐⭐     | ⭐⭐        | ⭐⭐⭐            | `user-story-to-tests.md` adaptado para gaps                                          |

---

## 10. PERGUNTA FINAL

> **Como dobrar o valor percebido do produto utilizando apenas Jira, Xray, GitHub/GitLab, LLM e dados já disponíveis, sem criar novos conectores?**

### Resposta em 3 movimentos:

#### Movimento 1: Orquestrar gates (ROI imediato, 1-2 dias)

Integrar no pipeline CI os gates já implementados:

1. `test-impact.ts` → só rodar testes impactados (reduz CI em 40-70%)
2. `calculateHealthScore()` → pipeline falha se health < threshold
3. `analyzeCoverageGaps()` → pipeline falha se coverage gap > threshold
4. `calculateFlakiness()` → alerta se flakiness > 30%

**Valor adicionado:** Pipeline não é mais "passa ou falha" — é "passa com qualidade ou falha com diagnóstico". Cada build dá um health score + diagnóstico.

#### Movimento 2: Dashboard consolidado (ROI médio, 1 semana)

Criar 3 dashboards HTML que já podem ser gerados com dados existentes:

1. **Release Readiness** — tasks por versão + coverage + health + flakiness
2. **Quality Trend** — health score + defect category distribution + flakiness trend
3. **Traceability Matrix** — requisito → teste → execução → resultado

**Valor adicionado:** O produto passa de "ferramenta de automação" para "plataforma de observabilidade de qualidade". Dados que estavam dispersos em 6 JSONs + 3 APIs viram insight em 3 HTMLs.

#### Movimento 3: Automação de decisão (ROI alto, 2 semanas)

1. **Auto-triage** — falha → classificação → bug → assign → link aos testes
2. **Pre-push validation** — antes do commit: test-impact + coverage-gate
3. **Auto-retest** — teste flaky estabilizou? automaticamente remove da quarantine e fecha bug
4. **Scheduled quality report** — relatório semanal automático por e-mail/Slack (html → webhook)

**Valor adicionado:** O produto opera autonomamente. QA humano não classifica falhas, não cria bugs, não gera relatórios — só define thresholds e revisa exceções.

### Resultado final

Hoje o produto é **10 ferramentas** que resolvem problemas específicos.

Com esses 3 movimentos, passa a ser **1 plataforma** que:

- **Coleta** automaticamente de 4 fontes
- **Correlaciona** em 15+ pontos
- **Infere** health, risco, causa raiz
- **Decide** se pode fazer merge, se a release está pronta, se precisa de mais testes
- **Age** criando bugs, fechando issues, bloqueando pipelines, gerando relatórios

Sem um novo conector. Sem uma linha de infraestrutura nova. Apenas orquestrando o que já existe.

---

_Análise gerada em 2026-05-31. Baseada exclusivamente em capacidades identificadas no código-fonte do produto QA Tools._
