# Data Hub Layered Architecture — Multi-Source Data Extraction

## Overview

**O QUE**: Extensão do DataHub para extrair dados ricos de testes/CI de múltiplas fontes, sem exigir integração de framework nos projetos monitorados. O qa_tools (serviço centralizado) gerencia múltiplos projetos via APIs de CI.

**POR QUE**: O qa_tools analisa projetos EXTERNOS. Não pode instalar nada neles nem controlar seu CI. Precisa extrair tudo que é possível via APIs do GitHub/GitLab, com fallback para input manual quando as fontes automáticas não são suficientes.

**COMO**: Arquitetura de 7 camadas com cascata de fallback. Cada tipo de dado (coverage, test counts, failure classification, etc.) tem sua própria cascata de extração, priorizando fontes de alta confiabilidade e descendo para fontes de menor confiabilidade até o fallback manual.

**Business Rules**:

- **Padrão**: Fetch via REST API (sempre)
- **Plus**: Webhook (opcional, se projeto corporativo permitir)
- **Billable minutes / cost**: Fora de escopo

**Key Data Sources**:

- GitHub Actions REST API (pipelines, jobs, artifacts, check runs)
- GitLab REST API (pipelines, jobs, test reports)
- Artifact download + ZIP extraction (CTRF, JUnit XML, Mochawesome)
- Check Runs API (publish-test-results integration)
- Job logs (regex-based test summary extraction)
- Contents API (framework detection from package.json, config files)
- `gary-quinn/actions-usage` (agregação de métricas via `npx`, output JSON, grátis e MIT)
- Import/Export: JSON (primário) com JSON Schema validação, CSV (secundário — export GitHub UI + planilhas)
- **User Fallback** (arquivo local ou path de repositório — última instância)

**Fallback Chain**: CI API → `gary-quinn/actions-usage` → Check Runs → GitLab Native → Job Logs → Contents API → Artifacts → **User Input**

---

## Architecture — 7 Camadas

```
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 1: CI API (sempre disponível)                           │
│  - Pipeline runs (status, conclusion, branch, timestamps)       │
│  - Jobs (status, conclusion, steps com name/status)             │
│  - Timing (run duration)                                        │
│  - Artifacts metadata (id, name, size, expired)                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 2: Artefatos (quando existirem)                         │
│  - Download via downloadArtifact() existente                    │
│  - ZIP extraction com AdmZip                                    │
│  - CTRF JSON (vitest)                                           │
│  - JUnit XML (pytest, jest, mocha, java, .net)                  │
│  - Mochawesome JSON (mocha)                                     │
│  - Playwright JSON                                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 3: Check Runs (GitHub, quando disponível)               │
│  - publish-test-results output (summary, text, annotations)     │
│  - Check Run annotations (file/line/message)                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 4: Job Logs (fallback universal)                        │
│  - Test summary lines (regex parse)                             │
│  - Failure messages (regex extract)                             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 5: Contents API (framework detection)                   │
│  - package.json (dependencies)                                  │
│  - CI workflow (test commands)                                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 6: GitLab Native (pipeline API + test reports)          │
│  - Coverage via pipeline.coverage (sem arquivo local)           │
│  - JUnit XML via job.artifacts[].file_type: "junit"            │
│  - Test report via GET /pipelines/:id/test_report               │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 7: User Fallback (última instância)                      │
│  - askFilePath() — tab completion, validação de formato         │
│  - CTRF JSON / JUnit XML / Mochawesome — auto-detecção         │
│  - Só executa em TTY (CI sempre pula)                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Availability Matrix

### GitHub

| Dado                                         | Fonte        | Confiabilidade | Disponibilidade  | Limitação    |
| -------------------------------------------- | ------------ | -------------- | ---------------- | ------------ |
| Pipeline status, branch, timestamps          | CI API       | 100%           | Sempre           | —            |
| Job status, conclusion, steps[]              | CI API       | 100%           | Sempre           | —            |
| Job duration, queue time                     | CI API       | 100%           | Sempre           | —            |
| Artifacts metadata (id, name, size, expired) | CI API       | 100%           | Sempre           | —            |
| Artifacts content (CTRF/JUnit)               | Download     | 60-80%         | 90 dias          | Expira       |
| Check Runs status                            | CI API       | 100%           | Sempre           | —            |
| Check Runs summary (publish-test-results)    | Check Runs   | 40%            | Se action ativa  | ~60% não usa |
| Check Runs annotations (file/line/message)   | Check Runs   | 30%            | Se action ativa  | Raro         |
| Test counts via regex no job log             | Job Logs     | 60-70%         | Sempre           | Impreciso    |
| Framework detection                          | Contents API | 90%            | Se config existe | Limite 1MB   |
| Code churn (additions/deletions)             | Commits      | 100%           | Sempre           | —            |

### GitLab

| Dado                                        | Fonte        | Confiabilidade | Disponibilidade   | Limitação |
| ------------------------------------------- | ------------ | -------------- | ----------------- | --------- |
| Pipeline status, coverage, duration, source | CI API       | 100%           | Sempre            | —         |
| Job status, failure_reason, runner_manager  | CI API       | 100%           | Sempre            | —         |
| Artifacts (file_type: "junit" nativo)       | CI API       | 100%           | Sempre            | —         |
| Artifacts content                           | Download     | 95%            | Não expira        | —         |
| Test report (passed/failed/skipped)         | API          | 95%            | Sempre            | —         |
| Job logs (trace completo)                   | API          | 100%           | Sempre            | —         |
| Framework detection                         | Contents API | 90%            | Se arquivo existe | —         |

---

## Extractor Cascades

### Coverage

| Prioridade | Método                            | Confiabilidade | Fonte              | Módulo               |
| ---------- | --------------------------------- | -------------- | ------------------ | -------------------- |
| 1          | GitLab `pipeline.coverage`        | 100%           | Pipeline API       | coverage-extractor   |
| 2          | Regex no job log                  | 70%            | Job logs (API)     | coverage-extractor   |
| 3          | CTRF JSON `coverage` field        | 100%           | Artifact content   | coverage-extractor   |
| 4          | Check Runs `output.summary` (cov) | 60%            | Check Runs API     | coverage-extractor   |
| 5          | CSV baseline (import)             | 100%           | csv-importer       | csv-importer         |
| 6          | **Fallback manual**               | 100%           | User provides file | test-source-fallback |

### Test Counts

| Prioridade | Método                             | Confiabilidade | Fonte              | Módulo               |
| ---------- | ---------------------------------- | -------------- | ------------------ | -------------------- |
| 1          | GitLab test report                 | 95%            | API                | test-count-extractor |
| 2          | Check Runs `output.summary`        | 90%            | Check Runs API     | test-count-extractor |
| 3          | Check Runs annotations count       | 80%            | Check Runs API     | test-count-extractor |
| 4          | JUnit XML `<testsuite>` attributes | 100%           | Artifact content   | test-count-extractor |
| 5          | CTRF JSON `results.summary`        | 100%           | Artifact content   | test-count-extractor |
| 6          | Mochawesome JSON stats             | 100%           | Artifact content   | test-count-extractor |
| 7          | Regex no job log                   | 60%            | Job logs           | test-count-extractor |
| 8          | **Fallback manual**                | 100%           | User provides file | test-source-fallback |

### Test Status por Arquivo (annotations per file)

| Prioridade | Método                            | Confiabilidade | Fonte              | Módulo               |
| ---------- | --------------------------------- | -------------- | ------------------ | -------------------- |
| 1          | Check Runs annotations[]          | 90%            | Check Runs API     | test-count-extractor |
| 2          | JUnit XML `<testcase>` attributes | 100%           | Artifact content   | test-count-extractor |
| 3          | CTRF JSON `tests[].filePath`      | 100%           | Artifact content   | test-count-extractor |
| 4          | Mochawesome JSON file path        | 100%           | Artifact content   | test-count-extractor |
| 5          | Regex stacktrace no job log       | 60%            | Job logs           | test-count-extractor |
| 6          | **Fallback manual**               | 100%           | User provides file | test-source-fallback |

### Failure Classification

| Prioridade | Método                                     | Confiabilidade | Fonte              | Módulo               |
| ---------- | ------------------------------------------ | -------------- | ------------------ | -------------------- |
| 1          | GitLab `job.failure_reason`                | 100%           | Jobs API           | failure-classifier   |
| 2          | GitHub `job.steps[].conclusion`            | 90%            | Jobs API           | failure-classifier   |
| 3          | Check Runs annotations (file/line/message) | 90%            | Check Runs API     | failure-classifier   |
| 4          | Regex no job log                           | 70%            | Job logs           | failure-classifier   |
| 5          | **Fallback manual**                        | 100%           | User provides file | test-source-fallback |

### Framework Detection

| Prioridade | Método                          | Confiabilidade | Fonte              | Módulo               |
| ---------- | ------------------------------- | -------------- | ------------------ | -------------------- |
| 1          | Contents API: `package.json`    | 90%            | Contents API       | framework-detector   |
| 2          | Contents API: config files      | 90%            | Contents API       | framework-detector   |
| 3          | Contents API: CI workflow files | 80%            | Contents API       | framework-detector   |
| 4          | Job log output (framework name) | 60%            | Job logs           | framework-detector   |
| 5          | **Fallback manual**             | 100%           | User provides path | test-source-fallback |

### Success/Failure Rate

| Prioridade | Método                           | Confiabilidade | Fonte          | Módulo             |
| ---------- | -------------------------------- | -------------- | -------------- | ------------------ |
| 1          | Pipeline `status` / `conclusion` | 100%           | Pipeline API   | metrics-calculator |
| 2          | Job `conclusion`                 | 100%           | Jobs API       | metrics-calculator |
| 3          | Check Runs `conclusion`          | 100%           | Check Runs API | metrics-calculator |

### Historical Data (tendências)

| Prioridade | Método                                   | Confiabilidade | Fonte              | Módulo               |
| ---------- | ---------------------------------------- | -------------- | ------------------ | -------------------- |
| 1          | Pipeline history via REST API            | 100%           | Pipeline API       | metrics-calculator   |
| 2          | Run duration via timing API              | 100%           | Timing API         | metrics-calculator   |
| 3          | Artifacts (últimos 90 dias)              | 60%            | Download + parse   | metrics-calculator   |
| 4          | CSV import (baseline manual — GitHub UI) | 100%           | csv-importer       | csv-importer         |
| 5          | **Fallback manual**                      | 100%           | User provides file | test-source-fallback |

---

## Derived Metrics

| Métrica              | Cálculo                             | Confiabilidade | Fonte          |
| -------------------- | ----------------------------------- | -------------- | -------------- |
| Run duration         | `timing.run_duration_ms`            | 100%           | Timing API     |
| Duração pipeline     | `pipeline.duration`                 | 100%           | Pipeline API   |
| Duração job          | `job.completed_at - job.started_at` | 100%           | Jobs API       |
| Queue time           | `job.started_at - job.created_at`   | 100%           | Jobs API       |
| Success rate         | `count(success) / total * 100`      | 100%           | Pipelines      |
| Failure rate por job | `count(failure) / total * 100`      | 100%           | Jobs           |
| Avg duration         | `avg(durations)`                    | 100%           | Jobs           |
| Avg queue time       | `avg(queue times)`                  | 100%           | Jobs           |
| Test pass rate       | `passed / total * 100`              | 70%            | Artifacts/Logs |
| Coverage (GitLab)    | `pipeline.coverage`                 | 100%           | Pipeline API   |
| Coverage (GitHub)    | Regex → CTRF → User                 | 70%            | Cascata        |

---

## Cross-Cutting Modules

```
shared/data-hub/
├── hub.ts                          ← ORQUESTRA
├── providers/
│   ├── github-provider.ts          ← Dados brutos GitHub
│   └── gitlab-provider.ts          ← Dados brutos GitLab
├── test-source-fallback.ts         ← CAMADA 7: User Fallback
├── artifact-parser.ts             ← ZIP + CTRF/JUnit/Mochawesome
├── junit-xml-parser.ts            ← JUnit XML parser
├── log-parser.ts                  ← Test summary from job logs
├── extractors/
│   ├── coverage-extractor.ts       ← Cascata de coverage
│   ├── test-count-extractor.ts     ← Cascata de test counts
│   ├── failure-classifier.ts       ← Cascata de failure classification
│   └── framework-detector.ts       ← Cascata de framework detection
└── metrics/
    ├── metrics-types.ts            ← Interfaces de métricas
    ├── metrics-calculator.ts       ← Métricas derivadas
    ├── json-exporter.ts            ← Export JSON (primário, com schema)
    ├── json-importer.ts            ← Import JSON com validação JSON Schema
    ├── csv-exporter.ts             ← Export CSV (secundário — planilhas)
    └── csv-importer.ts             ← Import CSV (fallback manual — GitHub UI export)
```

### DataHub Orchestrator — Strategy + Fallback Pattern

O `hub.ts` implementa o padrão **Strategy + Orchestrator** (não Chain of Responsibility). Cada fonte de dados implementa uma interface comum `DataSourceProvider`, e o orchestrator as executa em ordem de prioridade com health-check prévio:

```typescript
interface DataSourceProvider {
    name: string;
    priority: number;
    isAvailable(ctx: CIContext): Promise<boolean>;
    extract(ctx: CIContext): Promise<TestResults | null>;
}

class DataSourceOrchestrator {
    constructor(private sources: DataSourceProvider[]) {
        this.sources.sort((a, b) => a.priority - b.priority);
    }

    async extract(ctx: CIContext): Promise<TestResults> {
        for (const source of this.sources) {
            if (await source.isAvailable(ctx)) {
                const result = await source.extract(ctx);
                if (result?.isValid()) return result;
            }
        }
        throw new AllSourcesFailedError(ctx);
    }
}
```

**Vantagens**:

- Adicionar nova fonte = nova classe implementando `DataSourceProvider`, sem mexer no orchestrator
- Health-check antes de tentar (proativo, não reativo)
- Prioridade é configurável por data type
- Fonte que falha não bloqueia as restantes

---

# DECISÕES TÉCNICAS

## 1. `fast-xml-parser` vs `xml2js`

**Decisão**: `fast-xml-parser`

**Justificativa**:

- 2-9x mais rápido que xml2js
- TypeScript nativo (xml2js depende de `@types/xml2js`)
- ESM nativo (xml2js é CommonJS only)
- Ativamente mantido (Jun 2026 vs xml2js Jul 2023 — 3 anos sem update)
- 90.3M weekly downloads vs 38M

**Ação**: `npm install fast-xml-parser` na Phase 21.

## 6. `gary-quinn/actions-usage`

**Status**: RESEARCH (Phase 0.8) — decisão será tomada durante a fase de pesquisa.

**Prós**:

- MIT, grátis, mantido (Mai/2026)
- Output JSON programático (`--format json`)
- Token scopes: apenas `actions:read`
- Roda via `npx` sem instalação global
- Dados per-developer que a REST API nativa não agrega

**Contras**:

- Dependência externa (se parar de ser mantido)
- `npx` adiciona latência no primeiro run
- Nem todas as métricas do tool são relevantes para o qa_tools

**Critério**: Se a Phase 0.8 demonstrar que o output JSON se alinha com as interfaces `metrics-types.ts`, adotar Opção A (wrapper). Caso contrário, usar como referência (Opção B) para validar cálculos manuais.

## 2. `ctrf` npm package

**Decisão**: NÃO instalar | Manter parser manual em `shared/result_parser.ts`

**Justificativa**:

- Parser manual tem zero dependências (`fs`, `path` apenas)
- Suporta CTRF e Mochawesome
- Retorna `ParseResult` que é exatamente o contrato dos consumers
- Package `ctrf` traz `ajv` (~1MB), `yargs`, `glob` — bloat desnecessário
- 228K weekly downloads é sólido, mas não justifica as dependências

## 3. Migração de Consumidores

**Decisão**: Incremental, um por vez

**Ordem** (menor risco → maior risco):

1. `session-context.ts` (1 caller, simples)
2. `test-results.ts` (1 caller, já usa DataHub parcialmente)
3. `case17.ts` (1 caller, mais complexo)
4. `batch-mode.ts` (1 caller, já usa DataHub)
5. `pr-report-core.ts` (core — por último)

Cada migração: RED test → GREEN implement → commit → validar → próximo.

## 4. Auditoria

**Decisão**: Auditoria única ao FINAL (Phase 26)

**Justificativa**: Auditar código incompleto gera falsos positivos e retrabalho.

## 5. Módulos Cross-Cutting

**Decisão**: Implementar PRIMEIRO (Phase 0)

**Justificativa**: São pré-requisitos para todas as outras phases.

---

# PLANO DE IMPLEMENTAÇÃO

```

┌──────────────────────────────────────────────────────────────────────────┐
│ FASE 0: CROSS-CUTTING MODULES (14h) — Módulos base                      │
│                                                                          │
│ 0.1 test-source-fallback.ts   (2h) — User Fallback (Camada 7)           │
│ 0.2 artifact-parser.ts        (3h) — ZIP + CTRF/JUnit/Mochawesome       │
│ 0.3 junit-xml-parser.ts       (2h) — JUnit XML parser                   │
│ 0.4 log-parser.ts             (2h) — Test summary from job logs         │
│ 0.5 extractors/               (5h) — coverage + test-count + failure    │
│ 0.6 metrics/                  (4h) — calculator + json-exporter + json-importer + csv-export │
│ 0.7 Fix `as any` (3) + `@ts-ignore` (3) em shared/data-hub/             │
│ 0.8 Research `gary-quinn/actions-usage` integração (0.5h)               │
├──────────────────────────────────────────────────────────────────────────┤
│ COMMIT: feat(data-hub): add cross-cutting modules (fallback, parsers,   │
│         extractors, metrics, CSV, actions-usage research)               │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ FASE 18: DATA EXTRACTION (3h) — Extender tipos existentes                │
│                                                                          │
│ 18.1 Extender PipelineJob com stepConclusions + timestamps               │
│ 18.2 Extender ArtifactInfo com size_in_bytes, created_at                 │
│ 18.3 Mapear campos da API GitHub/GitLab nos providers                   │
├──────────────────────────────────────────────────────────────────────────┤
│ COMMIT: feat(types): extend PipelineJob + ArtifactInfo with API fields  │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ FASE 20: CONTENTS API + FRAMEWORK DETECTION (6h)                        │
│                                                                          │
│ 20.1 Extender GitProvider com getFileContents() + listDirectory()        │
│ 20.2 Git Trees API para monorepo discovery (1 call descobre todos)       │
│ 20.3 Implementar wfGetFileContents() + wfGetRepoTree() no github-workflow│
│ 20.4 Implementar glGetFileContents() + glGetRepoTree() no gitlab-workflow│
│ 20.5 Criar framework-detection.ts (detectFrameworkFromAPI)               │
│ 20.6 Integrar detector + trees nos providers do DataHub                  │
├──────────────────────────────────────────────────────────────────────────┤
│ COMMIT: feat(data-hub): add Contents API + Trees API + framework detect │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ FASE 21: ARTIFACT DOWNLOAD + PARSE (10h)                                │
│                                                                          │
│ 21.1 Criar isTestArtifact() em artifact-parser.ts (PRÉ-REQUISITO)      │
│ 21.2 Adicionar parsedArtifacts ao RawData + import (PRÉ-REQUISITO)      │
│ 21.3 Integrar download + parse em github-provider.ts (BLOQUEADO)       │
│ 21.4 Integrar download + parse em gitlab-provider.ts (BLOQUEADO)       │
│ 21.5 Check Runs + GitLab Test Report (OPCIONAL)                        │
│ 21.6 Limite de artifacts por run (CONFIGURAÇÃO)                        │
│ 21.7 Atualizar testes existentes (PÓS-IMPL)                            │
├──────────────────────────────────────────────────────────────────────────┤
│ COMMIT: feat(data-hub): add artifact download + CTRF/JUnit parsers       │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ FASE 22: CONSUMER MIGRATION (10h) — INCREMENTAL                         │
│                                                                          │
│ 22.1 session-context.ts → DataHub                                        │
│ 22.2 test-results.ts → DataHub                                           │
│ 22.3 case17.ts → DataHub                                                 │
│ 22.4 batch-mode.ts → DataHub                                             │
│ 22.5 pr-report-core.ts → DataHub (POR ÚLTIMO)                            │
│ 22.6 metrics.ts → DataHub                                                │
├──────────────────────────────────────────────────────────────────────────┤
│ COMMIT: refactor: migrate all consumers to DataHub as single source of   │
│         truth                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ FASE 23: DEPRECATION + CLEANUP (3h)                                     │
│                                                                          │
│ 23.1 Deprecar git-artifact-downloader.ts                                 │
│ 23.2 Deprecar coverage-source.ts (leitura local)                         │
│ 23.3 Deprecar case17-test-utils.ts re-exports                           │
│ 23.4 Atualizar mocks (shared/__mocks__/)                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ COMMIT: refactor: deprecate local data modules, redirect to DataHub      │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ FASE 24: CONTRACT UPDATES (4h)                                          │
│                                                                          │
│ 24.1 Estender ArtifactInfo com size_in_bytes, created_at, expired,       │
│      archive_download_url, digest                                        │
│ 24.2 Adicionar CheckRunAnnotation em ci-cd.ts                            │
│ 24.3 Adicionar GitLabTestReport em ci-cd.ts                              │
│ 24.4 Atualizar RawData com parsedArtifacts, annotations, framework,      │
│      gitlabTestReport                                                    │
│ 24.5 Atualizar ComputedMetrics com testPassRate, testCounts, framework  │
├──────────────────────────────────────────────────────────────────────────┤
│ COMMIT: feat(types): extend contracts for artifact download + framework  │
│         detection                                                        │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ FASE 25: TESTING + QUALITY GATES (4h)                                   │
│                                                                          │
│ 25.1 Unit tests para os 8 novos módulos (Phase 0)                       │
│ 25.2 Property-based tests (artifact-parser, junit-xml-parser,            │
│      framework-detection)                                                │
│ 25.3 Integration tests (GitHub→DataHub→Report, GitLab→DataHub→Report)    │
│ 25.4 Pre-commit checklist                                                │
├──────────────────────────────────────────────────────────────────────────┤
│ COMMIT: test: add unit, property and integration tests for data-hub      │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ FASE 26: AUDITORIA FINAL DE QUALIDADE (4h)                              │
│                                                                          │
│ 26.1 Migração completa — nenhum consumidor lê dados locais               │
│ 26.2 Type Safety — 0 `as any`, 0 `@ts-ignore`, 0 `eslint-disable`       │
│ 26.3 Cobertura — ≥ 100%, PBT presente                                   │
│ 26.4 Performance — Contents API < 2s, artifact download < 5s             │
│ 26.5 Relatório em audit/functional/AUDIT-REPORT-REFACTORING.md           │
├──────────────────────────────────────────────────────────────────────────┤
│ COMMIT: docs: add final quality audit report for data-hub refactoring    │
└──────────────────────────────────────────────────────────────────────────┘

```

---

## Detalhamento por Fase

---

### FASE 0 — Cross-Cutting Modules

#### 0.1 — User Fallback (`shared/data-hub/test-source-fallback.ts`)

| Componente                 | Descrição                                       |
| -------------------------- | ----------------------------------------------- |
| `askTestSource()`          | Flow interativo: arquivo ou path de repositório |
| `validateTestFile()`       | Valida formato (CTRF, JUnit, Mochawesome)       |
| `formatValidationResult()` | Feedback visual (success/error boxes)           |
| `DATAHUB_ERRORS`           | Erros conhecidos com hints                      |

**Fluxo**: Detectar TTY → Mostrar contexto → Mostrar exemplos → Pedir input → Validar → Aceitar ou Retry

**Testes**:

| #   | Teste                                   | Esperado               |
| --- | --------------------------------------- | ---------------------- |
| R1  | `askTestSource()` em TTY                | Retorna arquivo válido |
| R2  | `askTestSource()` em CI (non-TTY)       | Retorna null           |
| R3  | CTRF válido → `validateTestFile()`      | ParseResult válido     |
| R4  | JUnit XML válido → `validateTestFile()` | ParseResult válido     |
| R5  | Arquivo inválido → `validateTestFile()` | null                   |
| R6  | Skip com contexto + hint                | Mensagem clara         |

#### 0.2 — Artifact Parser (`shared/data-hub/artifact-parser.ts`)

```typescript
export function parseArtifactBuffer(buffer: Buffer, fileName: string): ArtifactParseResult | null {
    if (fileName.endsWith('.zip')) {
        return parseZipBuffer(buffer);
    }
    const content = buffer.toString('utf-8');
    if (isCTRF(content)) return parseCTRF(content);
    if (isJUnit(content)) return parseJUnitXml(content);
    if (isMochawesome(content)) return parseMochawesome(content);
    return null;
}

export function parseZipBuffer(buffer: Buffer): ArtifactParseResult[] {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    // Para cada entry, detectar formato e parsear
}
```

| Componente              | Descrição                       |
| ----------------------- | ------------------------------- |
| `parseArtifactBuffer()` | Detecta formato e parseia       |
| `parseZipBuffer()`      | Extrai ZIP e delega para parser |
| `isCTRF()`              | Detecta CTRF JSON               |
| `isJUnit()`             | Detecta JUnit XML               |
| `isMochawesome()`       | Detecta Mochawesome JSON        |

**Testes**:

| #   | Teste                                       | Esperado                          |
| --- | ------------------------------------------- | --------------------------------- |
| R1  | ZIP com CTRF → parseZipBuffer               | `ArtifactParseResult[]` com dados |
| R2  | Buffer CTRF → parseArtifactBuffer           | ParseResult válido                |
| R3  | Buffer JUnit → parseArtifactBuffer          | ParseResult válido                |
| R4  | Buffer inválido → parseArtifactBuffer       | null                              |
| R5  | ZIP vazio → parseZipBuffer                  | `[]`                              |
| R6  | ZIP com múltiplos formatos → parseZipBuffer | Array mesclado                    |

#### 0.3 — JUnit XML Parser (`shared/junit-xml-parser.ts`)

**Dependência**: `npm install fast-xml-parser`

```typescript
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
});

export interface JUnitTestCase {
    classname: string;
    name: string;
    time: number;
    status: 'passed' | 'failed' | 'skipped' | 'error';
    message?: string;
    stackTrace?: string;
}

export interface JUnitParseResult {
    tests: JUnitTestCase[];
    stats: { passed: number; failed: number; skipped: number; total: number; duration: number };
}
```

**Testes**:

| #   | Teste                                     | Esperado              |
| --- | ----------------------------------------- | --------------------- |
| R1  | JUnit XML válido → `FlatTest[]` e stats   | Dados corretos        |
| R2  | JUnit XML com failures → failure messages | Capturadas            |
| R3  | JUnit XML com skipped → skipped count     | Contado corretamente  |
| R4  | JUnit XML inválido → `null`               | Fallback              |
| R5  | JUnit XML vazio (0 testes)                | Stats zerados         |
| R6  | JUnit XML com múltiplos testsuite         | Merge corretamente    |
| R7  | JUnit XML com attachment tags             | Ignorado (não crasha) |

#### 0.4 — Log Parser (`shared/log-parser.ts`)

```typescript
const TEST_SUMMARY_PATTERNS: Record<string, RegExp> = {
    vitest: /Tests\s+(\d+)\s+passed.*?(\d+)\s+skipped\s*\((\d+)\)/,
    jest: /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/,
    mocha: /(\d+)\s+passing.*?(\d+)\s+failing/,
    pytest: /={2,}\s+(\d+) passed.*?(\d+) failed/,
    goTest: /^(ok|FAIL)\t(.+)\t(\d+\.\d+)s$/m,
};

const FAILURE_PATTERNS: RegExp[] = [
    /Error[:\s]+(.{10,100})/gi,
    /Failure[:\s]+(.{10,100})/gi,
    /AssertionError[:\s]+(.{10,100})/gi,
];

interface LogParseResult {
    testCounts?: { passed: number; failed: number; skipped: number; total: number };
    failures: string[];
    framework?: string;
}

export function parseTestSummaryFromLogs(logText: string): LogParseResult;
```

**Testes**:

| #   | Teste                                        | Esperado            |
| --- | -------------------------------------------- | ------------------- |
| R1  | vitest output → parseTestSummaryFromLogs     | Counts corretos     |
| R2  | jest output → parseTestSummaryFromLogs       | Counts corretos     |
| R3  | pytest output → parseTestSummaryFromLogs     | Counts corretos     |
| R4  | mocha output → parseTestSummaryFromLogs      | Counts corretos     |
| R5  | Output com failures → extractFailureMessages | Mensagens extraídas |
| R6  | Log vazio → parseTestSummaryFromLogs         | Empty result        |
| R7  | Log sem output de teste                      | Empty result        |

> **⚠️ RegEx Log Parsing — Fallback Degradado**
>
> O log-parser é o **último recurso** na cascata de extração de dados, ativado apenas quando fontes estruturadas (CTRF, JUnit, Check Runs) não estão disponíveis.
>
> **Limitações conhecidas** (confidence real: ~60-70% no melhor caso):
>
> - **Códigos ANSI**: Output com cores faz o regex falhar silenciosamente — é necessário strip prévio
> - **Output multi-linha**: Stack traces e falhas em 10+ linhas não são capturados por regex single-line
> - **Formato entre versões**: Vitest v1.x ≠ v2.x ≠ v3.x — regex precisa ser atualizado por framework
> - **Localização**: pytest-translate suporta 134 idiomas — regex em inglês falha em sistemas localizados
> - **Reporters customizados**: `--reporter=dot` (progress) ≠ `--reporter=spec` (verboso) — formato muda completamente
> - **Truncamento de log**: Logs CI >50MB são truncados — a linha de summary pode ser cortada
> - **Catastrophic backtracking**: Expressões com `.*` greedy em inputs grandes podem travar o parser
>
> **Sempre que possível, prefira fontes estruturadas** (CTRF, JUnit XML, Check Runs API).

#### 0.5 — Extractors (`shared/data-hub/extractors/`)

| Módulo               | Arquivo                   | Cascata                                           |
| -------------------- | ------------------------- | ------------------------------------------------- |
| Coverage Extractor   | `coverage-extractor.ts`   | GitLab → CTRF → Regex → JSON → User               |
| Test Count Extractor | `test-count-extractor.ts` | CTRF → JUnit → Check Runs → Regex → User          |
| Failure Classifier   | `failure-classifier.ts`   | GitLab → GitHub steps → Check Runs → Regex → User |
| Framework Detector   | `framework-detector.ts`   | package.json → Config → CI workflow → Log → User  |

#### 0.6 — Metrics (`shared/data-hub/metrics/`)

| Módulo        | Arquivo                 | Descrição                                                  |
| ------------- | ----------------------- | ---------------------------------------------------------- |
| Types         | `metrics-types.ts`      | Interfaces de métricas                                     |
| Calculator    | `metrics-calculator.ts` | Cálculos de duração, queue, success rate                   |
| JSON Exporter | `json-exporter.ts`      | Export JSON com JSON Schema (primário)                     |
| JSON Schema   | `.schema.json`          | Validação de schema no import                              |
| CSV Exporter  | `csv-exporter.ts`       | Export CSV (secundário — planilhas)                        |
| CSV Importer  | `csv-importer.ts`       | Import CSV (interativo/fallback manual — GitHub UI export) |

O `metrics-calculator.ts` pode opcionalmente delegar aggregation para `npx actions-usage` (ver 0.8).

#### 0.7 — Fix Type Safety

Corrigir antes de adicionar código novo:

- 3 `as any` em `shared/data-hub/`
- 3 `@ts-ignore` / `@ts-expect-error` em `shared/data-hub/`

#### 0.8 — Research `gary-quinn/actions-usage` Integration

Avaliar integração do `gary-quinn/actions-usage` como fonte de métricas agregadas:

**O que é**: CLI tool que calcula métricas de GitHub Actions per-developer, per-workflow e per-repo — wall-clock minutes, pass/fail rates, cost estimation. MIT, ativo, JSON output.

**Objetivo**: Decidir entre:

- **Opção A (wrapper)**: Chamar `npx actions-usage --repo owner/repo --format json` e parsear o JSON no `metrics-calculator.ts`
- **Opção B (referência)**: Usar o output como baseline para validar os cálculos manuais do `metrics-calculator`
- **Opção C (pular)**: Manter cálculo manual puro (REST API + compute local)

**Critérios de decisão**:

| Critério             | Opção A | Opção B | Opção C |
| -------------------- | ------- | ------- | ------- |
| Zero dependência npm | ❌      | ✅      | ✅      |
| Dados per-developer  | ✅      | ~       | ❌      |
| Simplicidade         | ~       | ✅      | ✅      |
| Manutenção externa   | ❌      | ~       | ✅      |

**Artefato**: Decisão documentada em `DECISÕES TÉCNICAS` com justificativa.

---

### FASE 18 — Data Extraction

#### 18.1 — Extender PipelineJob

**Arquivo**: `shared/types/ci-cd.ts:58-75`

Adicionar campos ao `PipelineJob`:

```typescript
export interface PipelineJob {
    id: number | string;
    name: string;
    stage?: string;
    status: string;
    started_at?: string;
    finished_at?: string;
    duration?: number;
    stepConclusions?: StepConclusion[];
}

export interface StepConclusion {
    name: string;
    conclusion: string;
    number: number;
}
```

**Arquivo**: `git_triggers/github-workflow.ts:114-133`

Mapear `steps[]`, `started_at`, `finished_at` da API GitHub.

**Testes**:

| #   | Teste                                       | Esperado         |
| --- | ------------------------------------------- | ---------------- |
| R1  | `stepConclusions` populado para cada job    | Array com steps  |
| R2  | `started_at` / `finished_at` mapeados       | Campos presentes |
| R3  | Job sem steps → `stepConclusions` undefined | Não crasha       |

#### 18.2 — Extender ArtifactInfo

**Arquivo**: `shared/types/ci-cd.ts:96-101`

```typescript
export interface ArtifactInfo {
    id: string | number;
    name: string;
    size_in_bytes?: number;
    created_at?: string;
    expired?: boolean;
    archive_download_url?: string;
    digest?: string;
}
```

**Arquivo**: `git_triggers/github-workflow.ts:135-151`

Mapear `size_in_bytes`, `created_at` da API GitHub.

**Arquivo**: `git_triggers/gitlab-workflow.ts:104-119`

Mapear `size` da API GitLab.

**Testes**:

| #   | Teste                             | Esperado       |
| --- | --------------------------------- | -------------- |
| R1  | `size_in_bytes` populado (GitHub) | Campo presente |
| R2  | `size_in_bytes` populado (GitLab) | Campo presente |
| R3  | `created_at` populado (GitHub)    | Campo presente |

#### 18.3 — Integrar Timing API (Run Duration)

**Arquivo**: `git_triggers/github-workflow.ts` + `shared/data-hub/providers/github-provider.ts`

Adicionar chamada a `GET /runs/{run_id}/timing` no `fetchRawData()` para extrair a duração de execução do run:

```typescript
export interface WorkflowRunTiming {
    run_duration_ms: number;
}
```

**Arquivo**: `git_triggers/github-workflow.ts`

Implementar `wfGetWorkflowRunTiming()`:

```typescript
export async function wfGetWorkflowRunTiming(
    client: AxiosInstance,
    owner: string,
    repo: string,
    runId: number,
): Promise<WorkflowRunTiming | null> {
    const timing = await apiGet<{ run_duration_ms: number }>(
        client,
        `/repos/${owner}/${repo}/actions/runs/${runId}/timing`,
        { operation: 'buscar run duration', returnNull: true },
    );
    return timing ? { run_duration_ms: timing.run_duration_ms } : null;
}
```

**Testes**:

| #   | Teste                                  | Esperado                   |
| --- | -------------------------------------- | -------------------------- |
| R1  | Timing endpoint retorna dados válidos  | `run_duration_ms` presente |
| R2  | Timing endpoint falha → retorna null   | Não crasha                 |
| R3  | `run_duration_ms` mapeado corretamente | Campo presente             |

#### 18.4 — Generalizar timing no RawData

**Arquivo**: `shared/types/data-hub.ts`

```typescript
export interface WorkflowRunTiming {
    run_duration_ms: number;
}

export interface RawData {
    // ... existing fields
    timing?: Map<number, WorkflowRunTiming>; // keyed by run_id — duração de execução de cada run
}
```

---

### NOTA: Phase 19 omitida (resolução)

A Phase 19 foi originalmente omitida do plano. O conteúdo que deveria cobrir foi absorvido pelas fases existentes:

| Conteúdo esperado             | Fase absorvedora | Justificativa                                                                  |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| Job Logs test summary (regex) | Phase 18.4       | `log-parser.ts` criado na Phase 0; extração de failure reasons já usa job logs |
| Check Runs API (GitHub)       | Phase 21.5       | Anotações e publish-test-results integrados com artifact download              |
| GitLab Test Report            | Phase 21.5       | `/pipelines/:id/test_report` integrado com artifact download                   |

**Decisão**: Não renumerar (opção C). Manter numeração atual para preservar histórico de commits.

---

### FASE 20 — Contents API + Framework Detection

#### 20.1 — GitProvider extension

**Arquivo**: `shared/types/ci-cd.ts`

```typescript
export interface GitProvider {
    // ... existing methods
    getFileContents(owner: string, repo: string, path: string, ref?: string): Promise<string | null>;
    listDirectory(owner: string, repo: string, path: string, ref?: string): Promise<string[] | null>;
}
```

#### 20.2 — Git Trees API Discovery (Monorepo Support)

**Arquivo**: `git_triggers/github-workflow.ts` + `git_triggers/gitlab-workflow.ts`

Antes de ler manifest files via Contents API, usar Git Trees API para descobrir TODOS os arquivos do repositório em 1 chamada:

```typescript
// GitHub: GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1
export async function wfGetRepoTree(
    client: AxiosInstance,
    owner: string,
    repo: string,
    branch: string,
): Promise<string[] | null> {
    const response = await apiGet<{ tree: Array<{ path: string; type: string }> }>(
        client,
        `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    );
    return (
        response?.tree
            .filter((entry) => entry.type === 'blob' && isManifestFile(entry.path))
            .map((entry) => entry.path) ?? null
    );
}

// GitLab: GET /projects/{id}/repository/tree?recursive=true
export async function glGetRepoTree(client: AxiosInstance, projectId: string, ref: string): Promise<string[] | null> {
    // ... similar, filtra por manifest files
}

function isManifestFile(path: string): boolean {
    return /(^|\/)package\.json$|requirements\.txt$|pyproject\.toml$|Gemfile$|pom\.xml$|go\.mod$/i.test(path);
}
```

**Fluxo**: Trees API (1 call) → filter manifests → Contents API (N calls, só para manifests encontrados)

**Testes**:

| #   | Teste                         | Esperado                           |
| --- | ----------------------------- | ---------------------------------- |
| R1  | Repo com package.json na raiz | Array com `['package.json']`       |
| R2  | Monorepo com 5 package.json   | Array com 5 paths                  |
| R3  | Repo sem manifests            | Array vazio                        |
| R4  | API error → graceful fallback | `null` (tenta Contents API direto) |

#### 20.3 — GitHub implementation

**Arquivo**: `git_triggers/github-workflow.ts`

```typescript
export async function wfGetFileContents(
    client: AxiosInstance,
    owner: string,
    repo: string,
    path: string,
    ref?: string,
): Promise<string | null> {
    // GET /repos/{owner}/{repo}/contents/{path}?ref={ref}
    // Accept: application/vnd.github.raw+json
    // Retorna conteúdo cru sem base64
}

export async function wfListDirectory(
    client: AxiosInstance,
    owner: string,
    repo: string,
    path: string,
    ref?: string,
): Promise<string[] | null> {
    // GET /repos/{owner}/{repo}/contents/{path}?ref={ref}
    // Retorna lista de nomes de arquivos
}
```

#### 20.4 — GitLab implementation

**Arquivo**: `git_triggers/gitlab-workflow.ts`

```typescript
export async function glGetFileContents(
    client: AxiosInstance,
    projectId: string,
    path: string,
    ref?: string,
): Promise<string | null> {
    // GET /projects/:id/repository/files/{path}/raw?ref={ref}
}

export async function glListDirectory(
    client: AxiosInstance,
    projectId: string,
    path: string,
    ref?: string,
): Promise<string[] | null> {
    // GET /projects/:id/repository/tree?path={path}&ref={ref}
}
```

#### 20.5 — Framework Detection (`shared/framework-detection.ts`)

```typescript
const FRAMEWORK_SIGNATURES: Record<
    string,
    {
        dependencies: string[];
        configFiles: string[];
        cliPatterns: string[];
    }
> = {
    /* vitest, jest, playwright, cypress, mocha, pytest */
};

export async function detectFrameworkFromAPI(
    gitProvider: GitProvider,
    owner: string,
    repo: string,
    sha: string,
): Promise<{ framework: string; confidence: number }>;
```

**Testes**:

| #   | Teste                         | Esperado                                   |
| --- | ----------------------------- | ------------------------------------------ |
| R1  | package.json com vitest       | `{ framework: 'vitest', confidence: 0.9 }` |
| R2  | package.json com jest         | `{ framework: 'jest', confidence: 0.9 }`   |
| R3  | Sem framework detectado       | `{ framework: 'unknown', confidence: 0 }`  |
| R4  | API error → graceful fallback | `{ framework: 'unknown', confidence: 0 }`  |

#### 20.6 — Framework Detector Extractor (`shared/data-hub/extractors/framework-detector.ts`)

Cascata de detecção: Trees API discovery → package.json → Config files → CI workflow → Job Log → User

---

### FASE 21 — Artifact Download + Parse

**Ordem de dependência**: 21.1 → 21.2 → 21.3/21.4 → 21.5/21.6/21.7

#### 21.1 — `isTestArtifact()` (PRÉ-REQUISITO — compilação)

**Arquivo**: `shared/data-hub/artifact-parser.ts`

Criar função `isTestArtifact(name: string): boolean` com patterns unificados:

```typescript
const TEST_ARTIFACT_PATTERNS = ['ctrf', 'test-results', 'test-result', 'mochawesome', 'junit', 'e2e'];

export function isTestArtifact(name: string): boolean {
    const lower = name.toLowerCase();
    return TEST_ARTIFACT_PATTERNS.some((p) => lower.includes(p));
}
```

**Decisão**: Não incluir `'test'` sozinho — genérico demais, captura artifacts não-teste.

**Nota**: Padrões existentes fragmentados em:

- `git-artifact-downloader.ts:241` — `name.includes('ctrf') || name.includes('test-results')`
- `git-artifact-downloader.ts:279` — `name.includes('test') || name.includes('e2e') || name.includes('ctrf')`
- `test-results.ts:77` — `/mochawesome|test-result/i.test(a.name)`

**Teste**: Adicionar testes unitários para `isTestArtifact()` em `artifact-parser.test.ts`.

#### 21.2 — `parsedArtifacts` no RawData (PRÉ-REQUISITO — compilação)

**Arquivo**: `shared/types/data-hub.ts`

```typescript
import type { ArtifactParseResult } from '../data-hub/artifact-parser.js';

export interface RawData {
    // ... existing fields
    /** Parsed artifact data (CTRF, JUnit, Mochawesome) — flat array de todos os resultados */
    parsedArtifacts?: ArtifactParseResult[];
}
```

**Nota**: Dependência unidirecional (`data-hub.ts` → `artifact-parser.ts`). Sem risco circular.

#### 21.3 — Download + Parse em GitHub Provider (BLOQUEADO por 21.1 + 21.2)

**Arquivo**: `shared/data-hub/providers/github-provider.ts`

Adicionar chamada a `downloadArtifact()` no `fetchRawData()`:

```typescript
// Dentro do loop de jobs:
for (const run of runs) {
    // ... existing code ...
    // NOVO: baixar artifacts de teste
    const arts = await this.provider.listPipelineArtifacts(runIdNum);
    artifactsMap.set(runIdNum, arts);
    for (const art of arts) {
        if (isTestArtifact(art.name)) {
            try {
                const { buffer, filename } = await this.provider.downloadArtifact(art.id);
                const parsed = parseArtifactBufferAll(buffer, filename);
                parsedArtifacts.push(...parsed);
            } catch (err) {
                rootLogger.debug(`GitHub: artifact download failed for ${art.name}: ${String(err)}`);
            }
        }
    }
}
```

**Nota**: Usar `parseArtifactBufferAll()` (não `parseArtifactBuffer()`) para capturar todos os resultados de ZIPs.

#### 21.4 — Download + Parse em GitLab Provider (BLOQUEADO por 21.1 + 21.2)

**Arquivo**: `shared/data-hub/providers/gitlab-provider.ts`

Mesmo padrão do GitHub. Adaptar para GitLab API:

- `listPipelineArtifacts()` já implementado
- `downloadArtifact()` retorna `{ buffer, filename }` com filename do Content-Disposition header

#### 21.5 — Check Runs + GitLab Test Report (OPCIONAL)

**Arquivos**: `github-provider.ts`, `gitlab-provider.ts`

- GitHub: fetch annotations via Check Runs API
- GitLab: fetch test report via `/pipelines/:id/test_report`

**Nota**: Tipos adicionados na Phase 24. Integração dos providers aqui.

#### 21.6 — Limite de artifacts por run (CONFIGURAÇÃO)

**Arquivo**: `shared/types/data-hub.ts`

Adicionar parâmetro `maxArtifactsPerRun?: number` em `FetchOptions` (default: 5). Limita downloads por run para evitar timeouts.

#### 21.7 — Atualizar testes existentes (PÓS-IMPL)

**Arquivos**: `github-provider.test.ts`, `gitlab-provider.test.ts`

Inverter asserções existentes:

```typescript
// ANTES (comportamento antigo):
expect(mockProvider.downloadArtifact).not.toHaveBeenCalled();

// DEPOIS (comportamento novo):
expect(mockProvider.downloadArtifact).toHaveBeenCalled();
```

Adicionar novos testes:

- Teste de download + parse bem-sucedido
- Teste de download com erro (não deve crashar)
- Teste de filtro por `isTestArtifact()`
- Teste de limite de artifacts por run

#### 21.8 — Avaliação de Pré-requisitos (2026-07-07)

| #   | Pré-requisito                                 | Status         | Ação                    |
| --- | --------------------------------------------- | -------------- | ----------------------- |
| 1   | `isTestArtifact()` em `artifact-parser.ts`    | **NÃO EXISTE** | Criar (21.1)            |
| 2   | `parsedArtifacts` em `RawData`                | **NÃO EXISTE** | Adicionar campo (21.2)  |
| 3   | Import `ArtifactParseResult` em `data-hub.ts` | **NÃO EXISTE** | Adicionar import (21.2) |
| 4   | `parseArtifactBufferAll()`                    | ✅ EXISTE      | Nenhuma                 |
| 5   | `fast-xml-parser` instalado                   | ✅ EXISTE      | Nenhuma                 |
| 6   | `adm-zip` instalado                           | ✅ EXISTE      | Nenhuma                 |
| 7   | `downloadArtifact()` no `GitProvider`         | ✅ EXISTE      | Nenhuma                 |
| 8   | `downloadArtifact()` nos managers             | ✅ EXISTE      | Nenhuma                 |
| 9   | Arquivos de teste                             | ✅ EXISTE      | Nenhuma                 |

**Conclusão**: 3 de 9 pré-requisitos NÃO atendidos. Itens 1, 2 e 3 devem ser criados ANTES da Phase 21 executar.

---

### FASE 22 — Consumer Migration (Incremental)

#### Ordem de Migração

| Step | Consumer        | Arquivo                              | Risco |
| ---- | --------------- | ------------------------------------ | ----- |
| 22.1 | session-context | `shared/session-context.ts`          | Baixo |
| 22.2 | test-results    | `git_triggers/test-results.ts`       | Baixo |
| 22.3 | case17          | `jira_management/commands/case17.ts` | Médio |
| 22.4 | batch-mode      | `git_triggers/batch-mode.ts`         | Médio |
| 22.5 | pr-report-core  | `shared/pr-report-core.ts`           | Alto  |
| 22.6 | metrics         | `shared/metrics.ts`                  | Baixo |

Cada step segue o padrão RED → GREEN → REFACTOR.

---

### FASE 23 — Deprecation + Cleanup

| Arquivo                                         | Ação          | Substituto           |
| ----------------------------------------------- | ------------- | -------------------- |
| `shared/git-artifact-downloader.ts`             | `@deprecated` | DataHub              |
| `shared/coverage-source.ts` (leitura local)     | `@deprecated` | DataHub.raw.coverage |
| `jira_management/commands/case17-test-utils.ts` | `@deprecated` | DataHub              |
| `shared/__mocks__/git-artifact-downloader.ts`   | Atualizar     | DataHub mocks        |
| `shared/__mocks__/metrics.ts`                   | Atualizar     | DataHub mocks        |

---

### FASE 24 — Contract Updates

| Task | Arquivo                    | Mudança                                                                                       |
| ---- | -------------------------- | --------------------------------------------------------------------------------------------- |
| 24.1 | `shared/types/ci-cd.ts`    | `ArtifactInfo` com `size_in_bytes`, `created_at`, `expired`, `archive_download_url`, `digest` |
| 24.2 | `shared/types/ci-cd.ts`    | `CheckRunAnnotation` interface                                                                |
| 24.3 | `shared/types/ci-cd.ts`    | `GitLabTestReport` interface                                                                  |
| 24.4 | `shared/types/data-hub.ts` | `RawData` com `parsedArtifacts`, `annotations`, `framework`, `gitlabTestReport`               |
| 24.5 | `shared/types/data-hub.ts` | `ComputedMetrics` com `testPassRate`, `testCounts`, `framework`                               |

---

### FASE 25 — Testing + Quality Gates

#### Unit Tests

| Módulo                    | Testes Necessários |
| ------------------------- | ------------------ |
| `test-source-fallback.ts` | 6+ testes          |
| `artifact-parser.ts`      | 8+ testes          |
| `junit-xml-parser.ts`     | 8+ testes          |
| `log-parser.ts`           | 8+ testes          |
| `framework-detection.ts`  | 5+ testes          |
| `extractors/`             | 12+ testes         |
| `metrics/`                | 10+ testes         |

#### Property-Based Tests

| Módulo                   | Propriedade                                |
| ------------------------ | ------------------------------------------ |
| `artifact-parser.ts`     | "Nunca lança exceção com input arbitrário" |
| `junit-xml-parser.ts`    | "Nunca lança exceção com XML arbitrário"   |
| `framework-detection.ts` | "Confidence sempre entre 0 e 1"            |

#### Integration Tests

| Fluxo                                          | Teste            |
| ---------------------------------------------- | ---------------- |
| GitHub → DataHub → Compute → Report            | E2E completo     |
| GitLab → DataHub → Compute → Report            | E2E completo     |
| Fallback chain: artifacts → GitLab → logs → CI | Cascata funciona |

#### Pre-commit Checklist

```bash
npx vitest run --reporter=verbose          # 100% pass
npx vitest run --coverage                 # ≥ 100%
npx eslint . --max-warnings=0             # 0 violações
npx tsc --noEmit                          # 0 erros
rg "as any" --include="*.ts"              # 0 ocorrências
rg "@ts-ignore|@ts-expect-error" --include="*.ts"  # 0 ocorrências
```

---

### FASE 26 — Auditoria Final de Qualidade

#### 26.1 — Verificar Migração Completa

| #   | Verificação                                | Comando                        | Esperado               |
| --- | ------------------------------------------ | ------------------------------ | ---------------------- |
| 1   | Nenhum import de `git-artifact-downloader` | `rg "git-artifact-downloader"` | Só em mocks/deprecated |
| 2   | Nenhum `readIstanbulCoverage` em produção  | `rg "readIstanbulCoverage"`    | Só em deprecated       |
| 3   | Nenhum `parseTestResultsFile` em produção  | `rg "parseTestResultsFile"`    | Só em deprecated       |
| 4   | Nenhum `fs.readFileSync` para coverage     | `rg "readFileSync.*coverage"`  | 0 ocorrências          |
| 5   | DataHub tem `parsedArtifacts`              | `rg "parsedArtifacts"`         | Presente               |
| 6   | DataHub tem `framework`                    | `rg "raw.framework"`           | Presente               |

#### 26.2 — Verificar Type Safety

| #   | Verificação           | Comando            | Esperado      |
| --- | --------------------- | ------------------ | ------------- |
| 1   | `npx tsc --noEmit`    | TypeScript         | 0 erros       |
| 2   | `rg "as any"`         | Type safety        | 0 ocorrências |
| 3   | `rg "!\."`            | Non-null assertion | 0 ocorrências |
| 4   | `rg "eslint-disable"` | Lint bypass        | 0 ocorrências |

#### 26.3 — Verificar Cobertura

| #   | Verificação                 | Comando         | Esperado |
| --- | --------------------------- | --------------- | -------- |
| 1   | `npx vitest run --coverage` | Coverage total  | ≥ 100%   |
| 2   | Novos módulos têm PBT       | `rg "property"` | Presente |

#### Output da Auditoria

Relatório em `audit/functional/AUDIT-REPORT-REFACTORING.md`

---

### FASE 27 — TECHDOC.md Update

Atualizar `docs/TECHDOC.md` com a nova arquitetura:

#### 27.1 — Atualizar Diagrama de Arquitetura

Atualizar seção "Layered Diagram" com:

- DataHub layered architecture (7 camadas)
- Novos módulos: `artifact-parser.ts`, `junit-xml-parser.ts`, `framework-detection.ts`
- Novos providers: `github-provider.ts`, `gitlab-provider.ts`, `composite-provider.ts`
- Novos extractors: `coverage-extractor.ts`, `failure-reasons.ts`, etc.

#### 27.2 — Atualizar Variáveis e Constantes dos Testes

Documentar padrões de testes:

- Constantes centralizadas: `CONTEXT_IDS`, `MOCK_REPO`, `MOCK_OWNER`
- Mock factories: `git-provider-factory.ts`
- Padrões de mock: `vi.mocked()`, `createMockProvider()`

#### 27.3 — Atualizar Tabela de Módulos

Adicionar novos módulos:

- `shared/data-hub/` — Data Hub core
- `shared/data-hub/providers/` — Data providers
- `shared/data-hub/extractors/` — Data extractors
- `shared/data-hub/compute/` — Metrics computation
- `shared/data-hub/metrics/` — Export/import

#### 27.4 — Atualizar Dependências

Documentar dependências npm:

- `fast-xml-parser` — JUnit XML parsing
- `adm-zip` — ZIP extraction
- `fast-check` — Property-based testing

---

## API Endpoints Reference

### GitHub

| Endpoint                                                   | Method | Description                | Response                                               | Status                                                 |
| ---------------------------------------------------------- | ------ | -------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `GET /repos/{owner}/{repo}/actions/runs`                   | GET    | List workflow runs         | `WorkflowRun[]` com status, conclusion, timestamps     | ✅                                                     |
| `GET /repos/{owner}/{repo}/actions/runs/{run_id}`          | GET    | Get single run details     | `WorkflowRun` completo                                 | ✅                                                     |
| `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`     | GET    | List jobs for a run        | `Job[]` com `steps[]`, `started_at`, `finished_at`     | ✅                                                     |
| `GET /repos/{owner}/{repo}/actions/artifacts`              | GET    | List artifacts for a repo  | `Artifact[]` com `size_in_bytes`, `created_at`         | ✅                                                     |
| `GET /repos/{owner}/{repo}/actions/artifacts/{id}/{zip}`   | GET    | Download artifact ZIP      | Binary ZIP stream (302 redirect)                       | ✅                                                     |
| `GET /repos/{owner}/{repo}/commits/{sha}/check-runs`       | GET    | List check runs for commit | `CheckRun[]` com `output.summary`, `annotations_count` | ✅                                                     |
| `GET /repos/{owner}/{repo}/check-runs/{id}/annotations`    | GET    | Get check run annotations  | `Annotation[]` com `path`, `start_line`, `message`     | ✅                                                     |
| `GET /repos/{owner}/{repo}/contents/{path}`                | GET    | Read file from repo        | File content (base64 ou raw)                           | ✅                                                     |
| `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` | GET    | List repo file tree        | Full tree — **1 call descobre todos os manifests**     | ✅                                                     |
| `GET /repos/{owner}/{repo}/actions/runs/{run_id}/timing`   | GET    | Run duration in ms         | `{ run_duration_ms: integer }`                         | ⚠️ **Closing down** — extrair `run_duration_ms` apenas |
| `GET /repos/{owner}/{repo}/actions/workflows/{id}/timing`  | GET    | Workflow billing           | —                                                      | **Não usar** — financeiro fora de escopo               |

### GitLab

| Endpoint                                                 | Method | Description         | Response              | Status |
| -------------------------------------------------------- | ------ | ------------------- | --------------------- | ------ |
| `GET /projects/{id}/pipelines`                           | GET    | List pipelines      | Pipeline[]            | ✅     |
| `GET /projects/{id}/pipelines/{pipeline_id}/jobs`        | GET    | List jobs           | Job[]                 | ✅     |
| `GET /projects/{id}/pipelines/{pipeline_id}/test_report` | GET    | Test report summary | `{ test_suites: [] }` | ✅     |
| `GET /projects/{id}/repository/files/{path}/raw`         | GET    | Read file content   | Raw file content      | ✅     |
| `GET /projects/{id}/repository/tree?recursive=true`      | GET    | List repo file tree | Full tree             | ✅     |

### Timing Endpoint — Nota Importante

O endpoint `GET /actions/runs/{run_id}/timing` está marcado como "closing down", mas:

1. Ainda funciona e retorna `run_duration_ms` válido
2. Apenas `run_duration_ms` é extraído — informações financeiras (`billable`) são ignoradas
3. Quando o endpoint for desligado, `run_duration_ms` pode ser estimado via `pipeline.run_started_at` - `pipeline.updated_at`

---

## Learnings — Phase 18 (Data Extraction)

Registros de aprendizado obtidos durante a execução da Phase 18, aplicáveis às fases futuras.

### 1. Validation Hook: pipe-pipe empty-string rejeitado

O pre-commit hook rejeita o padrão `pipe-pipe space empty-string` (ex: `field` + pipe pipe + space + two quotes).

**Causa**: O validation hook bloqueia `pipe-pipe space empty-string` como prática insegura (converte falsy values como `0` ou `false` em string vazia).

**Solução**: Usar operador de coalescência nula (`?? ''`) — trata apenas `null`/`undefined`, preservando outros falsy values legítimos (ex: `runner_group_name: ""`).

**Impacto**: Aplica-se a toda fase que lida com campos opcionais de API de provider retornando `string | undefined`.

### 2. Padrão de tratamento de erros: usar `humanizeError`, nunca criar classes de erro

`shared/prompt-errors.ts` já contém `humanizeError()` (mapeia mensagens de erro conhecidas para `{ msg, hint }`), `extractErrorMessage()` e `printError()`.

**Decisão**: Não criar classes de erro novas (ex: `HumanizedError`) — usar exclusivamente `humanizeError` de `shared/prompt-errors.ts` como única fonte de formatação de erros para o usuário.

**Tech Debt Identificado**: `shared/errors.ts:formatErr` (extrai mensagem de qualquer Error) e `shared/prompt-errors.ts:extractErrorMessage` (extrai mensagem de AxiosError) têm sobreposição funcional. Consolidar em futura fase de cleanup.

### 3. Custo de mock ao tornar método obrigatório na interface

Adicionar `getWorkflowRunTiming` como obrigatório no `GitProvider` forçou atualização de 7 arquivos de teste (6 inline mocks + 1 factory).

**Trade-off**: Método obrigatório = sem `?.` em consumidores, mas custo único de mock maintenance quando adicionado. Método opcional = `?.` em cada consumidor, mas sem churn de teste.

**Recomendação**: Usar método obrigatório + default na base class (`GitProviderBase`) quando:

- O método tem um fallback válido (ex: retornar `null`)
- A maioria das implementações precisará do método (apenas 1 provedor faz exceção)
- Os consumidores são poucos e conhecidos

### 4. Provider-specific functionality via base class default + override

Para funcionalidade que só existe em um provider (GitHub timing, GitLab test report):

1. Adicionar à interface `GitProvider` como método obrigatório
2. Implementar default em `GitProviderBase` retornando `null` ou valor sentinela
3. Fazer `override` no provider específico que suporta a funcionalidade

Isso evita type assertions, verificacoes de tipo em tempo de execucao, e `?.` nos consumidores.

### 5. Endpoint de timing em extinção — tratamento graceful

O endpoint `GET /actions/runs/{run_id}/timing` está oficialmente "closing down" mas ainda funcional.

**Estratégia**: Extrair apenas `run_duration_ms`, tratar falhas gracefulmente (retornar `null` + log via `humanizeError`). Quando descontinuado: remover chamada → retornar null direto. Sem break de contrato porque o campo já é opcional no `RawData`.

---

## Learnings — Phase 20 (Contents API + Framework Detection)

Aprendizados registrados antes da execução, baseados na análise de design e experiência da Phase 18.

### 1. Framework detection — extrair lógica compartilhada

A `setup/detector.ts` já contém `detectFramework()` que detecta framework (cypress, playwright, jest, vitest) a partir do `package.json` local (filesystem).

**Decisão**: Extrair a lógica de detecção pura (`detectFrameworkFromDeps(deps) → { framework, confidence }`) para uma função compartilhada. Ambos os módulos chamam a mesma função, diferindo apenas em COMO leem o arquivo:

- `setup/detector.ts` → lê via `fs`
- `shared/framework-detection.ts` → lê via Contents API (remoto)

**Por que**: única fonte de verdade, zero duplicação, comportamento consistente, sem risco de quebrar o setup existente, testabilidade isolada.

### 2. Assinatura dos novos métodos no GitProvider

O plano propõe `getFileContents(owner: string, repo: string, path: string, ref?: string)`, mas os métodos existentes da interface não recebem owner/repo — usam estado interno dos managers (ex: `getRecentPipelines(count?)`).

**Decisão**: Seguir o padrão existente — `getFileContents(path: string, ref?: string)` e `listDirectory(path: string, ref?: string)` sem owner/repo na interface.

### 3. `isManifestFile` — cobertura de manifestos

O regex proposto cobre: `package.json`, `requirements.txt`, `pyproject.toml`, `Gemfile`, `pom.xml`, `go.mod`.

**Decisão**: Adicionar também `Cargo.toml` (Rust), `composer.json` (PHP), `build.gradle` / `build.gradle.kts` (Java/Kotlin) e `*.csproj` (.NET). A função deve ser facilmente extensível (ex: array de patterns).

### 4. `listDirectory` — tipo de retorno

O plano propõe `Promise<string[] | null>` (apenas nomes). A GitHub Contents API retorna objetos com `name`, `type`, `size`.

**Decisão**: Retornar `Array<{ name: string; type: 'file' | 'dir'; path: string }>` para permitir traversal recursivo sem chamadas adicionais. O `type` informa se é diretório sem precisar de stat extra.

### 5. Trees API — limites e fallback

- GitHub: recursivo retorna até 100.000 arquivos; acima disso → `422`
- GitLab: paginado por página; pode não retornar completo em uma chamada

**Decisão**: Implementar fallback: tentar Trees API → se falhar (422 ou incompleto), cair para Contents API diretório por diretório. A função deve expor `maxDepth?: number` para limitar recursão em monorepos.

### 6. Cachê do Trees API

O resultado da Trees API é custoso (1 chamada HTTP + parse de resposta grande). Se o mesmo repo é consultado várias vezes na sessão, o cache evita refetch.

**Decisão**: Implementar cache em memória (`Map<string, TreeEntry[]>`) com chave = `${owner}/${repo}/${ref}`. O cache é limpo ao final da sessão (sem persistência). Futuro: cache LRU com TTL.

### 7. Tratamento de erros — usar `humanizeError`

Regra carregada da Phase 18: nunca criar classes de erro novas. Usar exclusivamente `humanizeError()` de `shared/prompt-errors.ts` para formatar erros antes de logar ou retornar ao usuário.

### 8. Testes — usar constantes e variáveis centralizadas

Regra carregada da Phase 18: todos os testes devem usar as variáveis e constantes centralizadas em vez de literais mágicas (ex: `CONTEXT_IDS`, `MOCK_REPO`, `MOCK_OWNER` definidos em um local compartilhado).

### 9. isManifestFile — regex não pode capturar lockfiles

O pattern `Gemfile([^/]*)?$` capturava `Gemfile.lock` como manifest. Corrigido para `Gemfile$`.

**Regra**: lockfiles (`Gemfile.lock`, `package-lock.json`, `yarn.lock`, `Cargo.lock`) nunca são manifest.

### 10. switch evita falso positivo do no-unnecessary-condition

O eslint com `@typescript-eslint/no-unnecessary-condition` flagou ternário `e.type === 'blob' ? 'file' : 'dir'` após guard clause como "comparação sempre verdadeira". Solução: usar `switch` com `default: continue`.

### 11. `Object.keys` + `includes` evita detect-object-injection

O acesso dinâmico `deps[dep]` no `detectFrameworkFromDeps` disparou `security/detect-object-injection`. Solução: iterar `Object.keys(deps)` + `knownDeps.includes(dep)`.

### 12. Integração test deve usar `toStrictEqual`

O linter `vitest/prefer-strict-equal` exige `toStrictEqual` em vez de `toEqual` para objetos.

### 13. parseArtifactBuffer — retorno único para ZIPs com múltiplos resultados

**Problema**: `parseArtifactBuffer()` retornava apenas o primeiro resultado de um ZIP que pode conter múltiplos arquivos de teste (CTRF, JUnit, Mochawesome).

**Correção**: Criada `parseArtifactBufferAll(buffer, fileName): ArtifactParseResult[]` que retorna todos os resultados. `parseArtifactBuffer()` agora delega para `parseArtifactBufferAll()` e retorna `[0]` ou null.

**Registro**: Commit 9bb96064 (fix: lint auto-fix for Phase 20 test files).

### 14. Metrics-run captura conteúdo WIP

**Problema**: O script de métricas (`qa-tools: update metrics run`) commita automaticamente o working tree. Durante Phase 20, o conteúdo WIP foi capturado como commit `067871a9`.

**Impacto**: Histórico de commits contém "metrics run" com código de features. Não há como limpar sem rebase interactivo (arriscado com 19+ commits à frente do origin).

**Decisão**: Aceitar o estado atual. Registrar como limitação do processo de CI. Não reverter.

### 15. Tree cache — TTL de 5 min pode ficar obsoleto

**Problema**: O cache em memória (`wfGetRepoTreeCached`) usa TTL de 5 minutos. Se o repositório mudar durante uma sessão longa, dados desatualizados são retornados.

**Impacto**: Baixo para sessões típicas (< 5 min). Médio para sessões longas com múltiplas consultas ao mesmo repo.

**Decisão**: Documentar como limitação conhecida. Se necessário no futuro, adicionar `clearTreeCache()` antes de operações de longa duração ou expor opção `forceRefresh`.

---

## Quality Gates por Phase

| Phase | tsc --noEmit | lint        | vitest    | PBT        | Audit       |
| ----- | ------------ | ----------- | --------- | ---------- | ----------- |
| 0     | 0 erros      | 0 violações | 100% pass | ✅ parsers | —           |
| 18    | 0 erros      | 0 violações | 100% pass | —          | —           |
| 20    | 0 erros      | 0 violações | 100% pass | —          | —           |
| 21    | 0 erros      | 0 violações | 100% pass | ✅         | —           |
| 22    | 0 erros      | 0 violações | 100% pass | —          | —           |
| 23    | 0 erros      | 0 violações | 100% pass | —          | —           |
| 24    | 0 erros      | 0 violações | 100% pass | —          | —           |
| 25    | 0 erros      | 0 violações | 100% pass | ✅         | —           |
| 26    | 0 erros      | 0 violações | 100% pass | ✅         | ✅ completa |

---

## Summary

| #         | Fase                               | Horas   | Risco  | Depende de    |
| --------- | ---------------------------------- | ------- | ------ | ------------- |
| 0         | Cross-Cutting Modules              | 14h     | Low    | —             |
| 18        | Data Extraction                    | 3h      | Low    | —             |
| 20        | Contents API + Framework Detection | 6h      | Medium | 18            |
| 21        | Artifact Download + Parse          | 10h     | High   | 0, 18         |
| 22        | Consumer Migration                 | 10h     | High   | 20, 21, 24    |
| 23        | Deprecation + Cleanup              | 3h      | Low    | 22            |
| 24        | Contract Updates                   | 4h      | Medium | 18            |
| 25        | Testing + Quality Gates            | 4h      | Low    | 0, 20, 21, 24 |
| 26        | Auditoria Final                    | 4h      | Medium | 22, 23, 25    |
| 27        | TECHDOC.md Update                  | 2h      | Low    | 26            |
| **Total** |                                    | **60h** |        |               |

---

## Dependências npm

| Package           | Ação               | Phase     |
| ----------------- | ------------------ | --------- |
| `fast-xml-parser` | Instalar           | 0 (ou 21) |
| `ctrf`            | NÃO instalar       | —         |
| `adm-zip`         | Já instalado       | —         |
| `fast-check`      | Já instalado (PBT) | —         |

## Progress

- [ ] Phase 0 — Cross-Cutting Modules
- [x] Phase 18 — Data Extraction
- [x] Phase 20 — Contents API + Framework Detection
- [ ] Phase 21 — Artifact Download + Parse
- [ ] Phase 22 — Consumer Migration
- [ ] Phase 23 — Deprecation + Cleanup
- [ ] Phase 24 — Contract Updates
- [ ] Phase 25 — Testing + Quality Gates
- [ ] Phase 26 — Auditoria Final de Qualidade
- [ ] Phase 27 — TECHDOC.md Update
