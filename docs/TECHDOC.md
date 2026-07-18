# QA Tools — Technical Reference

> Documento técnico consolidado para consulta de IA.
> Mantenha atualizado sempre que contratos, tipos ou arquitetura mudarem.

---

## SYSTEM OVERVIEW

**Propósito:** CLI toolset para automação de QA — integração Jira/Xray, triggers GitLab/GitHub, report generation, análise de cobertura e qualidade.

| Atributo  | Valor                                                                           |
| --------- | ------------------------------------------------------------------------------- |
| Runtime   | Node v22+ LTS (`.nvmrc`: v20.11.1), ESM (`"type": "module"`)                    |
| Linguagem | TypeScript 6 strict — 348 source files, 627 test files                          |
| Testes    | Vitest v4, V8 coverage (lines 90%, functions 91%, branches 80%, statements 90%) |
| Lint      | ESLint v10 + typescript-eslint v8 (strict type-checked), Prettier v3            |
| CI        | GitHub Actions (3 workflows) + GitLab CI                                        |

**Módulos top-level:**

```
qa_tools/
├── jira_management/      # CLI app: 27 operações Jira/Xray (interactive menu)
├── git_triggers/         # CLI app: pipeline triggers, MR, branch, AI desc (interactive + batch)
├── shared/               # Biblioteca compartilhada (tipos, http-client, llm, invariants, store, reports)
├── setup/                # Setup wizard interativo (detecta framework, gera CI pipelines)
├── scripts/              # Utilitários (build, quality-check, ux-audit, smartwizard)
├── config/               # JSON configs legados (providers.json, reviewers.json) — registry em XDG (~/.config/qa-tools)
├── docs/                 # Documentação para humanos (13 arquivos)
├── e2e/                  # End-to-end tests (24 files)
```

---

## ARCHITECTURE

### Layered Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    jira_management/                         │
│  main.ts → ui-helpers.ts → commands/case*.ts               │
│  Commands recebem CommandContext (DIP)                      │
├─────────────────────────────────────────────────────────────┤
│                    git_triggers/                             │
│  main.ts → cli-args.ts → cli-dispatch.ts →                  │
│    → batch-mode.ts | interactive-mode.ts                    │
│    → pipeline-handler, mr-handler, nivelar, ai-pr-desc     │
├─────────────────────────────────────────────────────────────┤
│                    shared/                                   │
│  config-accessor, logger, http-client, jira-client,         │
│  llm-client (6 tiers), state, store, metrics, temp-dir,    │
│  invariants (13), palette, prompts, validation,             │
│  reports, markdown, coverage, health-score                  │
├─────────────────────────────────────────────────────────────┤
│                    setup/                                    │
│  main.ts → detector.ts → config-writer.ts → templates/*     │
└─────────────────────────────────────────────────────────────┘
```

### Key Patterns

| Pattern                      | Where                                                         | Description                                                                             |
| ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **DI / Command**             | `jira_management/commands/`                                   | 27 handlers (`case01.ts`–`case27.ts`) recebem `CommandContext` com resources injetados  |
| **Provider Strategy**        | `git_triggers/`                                               | `GitProvider` interface → `GitLabManager` / `GitHubManager` estendem `GitProviderBase`  |
| **Dependency Wall**          | `shared/deps.ts`                                              | Todo import externo passa por este arquivo. ESLint `no-restricted-imports` enforced     |
| **Resilience Stack**         | `shared/http-client.ts`, `shared/llm-*.ts`                    | Circuit breaker + rate limiter + cache (memória + disco) + fallback chain (6 tiers)     |
| **State Persistence**        | `shared/state.ts`                                             | Per-project `<xdgStateHome>/qa-tools/<project>/state.json` + shared `global.json`, com backup recovery |
| **Store (Git-backed Cache)** | `shared/store.ts`                                             | SHA-keyed report cache, commits com `[skip ci]`, cross-session/sync                     |
| **Invariants**               | `shared/invariants/`                                          | 13 regras T-01 a T-13 + 5 I-01 a I-05 para validação de artefatos de teste              |
| **Feature Config**           | `shared/feature-config.ts` + `shared/types/feature-config.ts` | Config store + Zod schema — **PR-Report-specific** até segundo consumer existir         |
| **Temp Dir**                 | `shared/temp-dir.ts`                                          | Gerenciamento de diretórios temporários (reports, ephemeral, cache, logs, previews)     |
| **Integration Helpers**      | `shared/__tests__/integration/integration-helpers.ts`         | Fixtures factories + I/O helpers para testes de integração                              |
| **Quality Gate**             | `shared/quality-gate.ts`                                      | Orquestrador de quality gate — thresholds fixos, compõe health/coverage/flakiness       |
| **Coverage Source**          | `shared/coverage-source.ts`                                   | Resolução de cobertura em camadas: Istanbul coverage-summary.json > CTRF > 0 padrão     |
| **Quality Metrics**          | `shared/quality-metrics.ts`                                   | Coleta e persistência de métricas de qualidade: fire rates, pass rates, drift detection |
| **Quality Suggester**        | `shared/quality-suggester.ts`                                 | Pipeline de detecção de sinais de qualidade: drift, latência, taxa de falha, benchmark  |
| **Benchmark Metrics**        | `shared/benchmark-metrics.ts`                                 | Computação de métricas de cobertura de benchmark: critérios, partições, boundary values |

### Resilience Stack (LLM)

```
llm-client.ts
├── Tier: main (OpenRouter), fast (Groq), reviewer (Gemini), report (main), fallback (NVIDIA), batch (GitHub Models)
├── CircuitBreaker (shared/circuit-breaker.ts) — estado OPEN/HALF/CLOSED
├── RateLimiter (shared/llm-rate-limiter.ts) — req/min per tier
├── Cache (shared/llm-cache.ts) — memória LRU + disco SHA-keyed
└── FallbackChain (shared/llm-fallback.ts) — main → fallback → batch
```

### HTTP Client Resilience

```
http-client.ts (axios wrapper)
├── Exponential backoff + jitter (2s base, 120s max)
├── Network error auto-retry (ECONNRESET, ECONNREFUSED, ENOTFOUND, ETIMEDOUT)
└── Per-operation retry tracking with cleanup
```

---

## DOMAIN MODEL

### Common Types (`shared/types/common.ts`)

```typescript
type JsonObject = Record<string, unknown>;
type LogContext = Record<string, unknown>;
type StateContainer = Record<string, unknown>;

interface TestResult {
    status: 'ok' | 'error';
    label: string;
    message: string;
}

interface StateSchema {
    lastChoice?: string;
    lastProject?: string;
    lastCypressPath?: string;
    lastLabels?: string;
    lastCsvPath?: string;
    history?: Array<{ op: string; detail: string; status: string; ts: string }>;
    _checkpoint?: {
        csvPath: string;
        jsonPath: string;
        project: string;
        testCount: number;
        done: Array<{ key: string; title: string }>;
        ts: string;
    };
    _llmConfigured?: boolean;
    _llmConfigAttempts?: number;
    _llmConfigLastAttempt?: string;
    _llmConfigSuggestions?: {
        pending: boolean;
        qualitySignals?: Array<{
            severity: 'info' | 'warning' | 'critical';
            source: string;
            message: string;
            suggestedAction: string;
        }>;
        tierData?: Record<string, string>;
        timestamp?: string;
    };
    _llmConfigError?: string;
}

type HealthScoreGrade = 'excellent' | 'good' | 'needs_attention' | 'poor' | 'critical';

enum ExitCode {
    OK = 0,
    ERROR = 1,
    USAGE = 2,
    UNAVAILABLE = 3,
}

interface ConfigOverrides {
    /* all env vars as optional camelCase strings */
}
```

### Jira Types (`shared/types/jira.ts`)

```typescript
interface JiraIssueType {
    id?: string;
    name?: string;
    description?: string;
    subtask?: boolean;
}
interface JiraStatus {
    id?: string;
    name?: string;
    description?: string;
    statusCategory?: { id?: number; key?: string; name?: string };
}
interface JiraPriority {
    id?: string;
    name?: string;
    description?: string;
    iconUrl?: string;
}

interface JiraIssueFields {
    summary?: string;
    description?: string;
    status?: JiraStatus;
    priority?: JiraPriority;
    issuetype?: JiraIssueType;
    labels?: string[];
    fixVersions?: Array<{ id?: string; name?: string; released?: boolean }>;
    project?: { id?: string; key?: string; name?: string };
    issuelinks?: JiraIssueLink[];
    [key: string]: unknown;
}

interface JiraIssueLink {
    id?: string;
    type?: { id?: string; name?: string; inward?: string; outward?: string };
    inwardIssue?: { id?: string; key?: string; fields?: JiraIssueFields };
    outwardIssue?: { id?: string; key?: string; fields?: JiraIssueFields };
}

interface JiraIssue {
    id: string;
    key: string;
    self?: string;
    fields: JiraIssueFields;
}
interface JiraSearchResult {
    issues: JiraIssue[];
    total: number;
    startAt: number;
    maxResults: number;
}

interface JiraResourceLike {
    getJiraResource<T>(url: string): Promise<T>;
    postJiraResource<T>(url: string, data?: unknown): Promise<T>;
    putJiraResource<T>(url: string, data?: unknown): Promise<T | null>;
    searchJiraIssues(jql: string, maxResults?: number): Promise<SearchIssuesResponse>;
    getTransitionsForIssue(issueKey: string): Promise<Record<string, string>>;
    transitionIssue(issueId: string, transitionId: string): Promise<void>;
}

interface SearchIssuesResponse {
    issues: Array<{ key: string; fields: Record<string, unknown> }>;
    total: number;
}
interface JiraLinkManagerLike {
    linkIssues(sourceKey: string, linkedIssues: Array<{ key: string; linkType: string }>): Promise<unknown>;
}
```

### Xray Types (`shared/types/xray.ts`)

```typescript
interface TestStep {
    fields: { Action?: string; Data?: string; 'Expected Result'?: string };
}

interface PreConditionSummary {
    key: string;
    summary: string;
}
interface TestExecutionSummary {
    key: string;
    summary: string;
    status: string;
    created: string;
}

interface PreConditionMatchResult {
    key: string;
    summary: string;
    matchType: 'exact' | 'containment' | 'overlap' | 'create';
}

interface TestCase {
    title: string;
    description?: string;
    steps: TestStep[];
    precondition?: { type: 'inline' | 'reference'; value: string };
    group?: string;
    linkedIssues?: Array<{ key: string; linkType: string }>;
}

interface XrayTestRun {
    id?: string;
    status?: { name?: string };
    testExecution?: { key?: string; id?: string; issueId?: string };
    startedOn?: string;
    finishedOn?: string;
}
```

### CI/CD Types (`shared/types/ci-cd.ts`)

```typescript
interface PipelineInfo {
    id?: string | number;
    web_url?: string;
    status?: string;
    state?: string;
    ref?: string;
}
interface ScheduleInfo {
    id: string | number;
    description?: string;
    next_run_at?: string;
}
interface MergeRequestInfo {
    iid?: string | number;
    number?: string | number;
    title?: string;
    state?: string;
    web_url?: string;
    description?: string;
    source_branch?: string;
    target_branch?: string;
    approved?: boolean;
}
interface CICDVariable {
    key: string;
    value: string;
    type?: string;
}
interface PipelineJob {
    id: string | number;
    name: string;
    stage: string;
    status: string;
    stepConclusions?: Array<{ name: string; conclusion: string; number: number }>;
}
interface Issue {
    number: number;
    title: string;
    state: string;
    updated_at: string;
    created_at: string;
    labels: string[];
    html_url: string;
}
interface ArtifactInfo {
    id: string | number;
    name: string;
}
interface PipelineRun {
    id?: string | number;
    run_number?: string | number;
    ref?: string;
    head_branch?: string;
    status?: string;
    conclusion?: string;
    web_url?: string;
    event?: string;
    created_at?: string;
    updated_at?: string;
    run_started_at?: string;
}
interface PipelineTriggerResult {
    id?: string | number;
    web_url?: string;
    run_number?: string | number;
}

interface GitProvider {
    triggerPipeline(payload: {
        ref: string;
        variables: Array<{ key: string; value: string }>;
        workflow_id?: string;
    }): Promise<PipelineTriggerResult | undefined>;
    getSchedules(): Promise<ScheduleInfo[]>;
    runSchedule(scheduleId: string | number): Promise<Record<string, unknown>>;
    createMergeRequest(
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ): Promise<MergeRequestInfo | null>;
    updateMergeRequest(iid: string | number, title: string, description?: string): Promise<MergeRequestInfo | null>;
    getMergeRequest(iid: string | number): Promise<MergeRequestInfo | null>;
    searchMergeRequests(sourceBranch: string, targetBranch: string, status: string): Promise<MergeRequestInfo[]>;
    acceptMergeRequest(iid: string | number, removeSourceBranch?: boolean): Promise<MergeRequestInfo | null>;
    isApproved(id: string | number): Promise<boolean>;
    getCICDVariables(): Promise<CICDVariable[] | null>;
    getRecentPipelines(count?: number): Promise<PipelineRun[]>;
    getBranch(branch: string): Promise<{ name: string } | null>;
    getPipeline(id: string | number): Promise<PipelineInfo | null>;
    getPipelineJobs(pipelineId: string | number): Promise<PipelineJob[]>;
    listPipelineArtifacts(pipelineId: string | number): Promise<ArtifactInfo[]>;
    downloadArtifact(artifactId: string | number): Promise<{ buffer: Buffer; filename: string }>;
    getDiff(source: string, target: string): Promise<string>;
    provider: 'gitlab' | 'github';
}
```

### Data Hub (`shared/data-hub/`)

Repositório central de métricas do CI/CD. Busca dados das APIs do GitHub/GitLab, calcula métricas derivadas uma única vez, e serve como ÚNICA fonte de dados para todos os scores, dashboards e relatórios do projeto.

**Arquitetura em camadas:**

```
shared/data-hub/
├── hub.ts           ← DataHubImpl.create() — orchestration
├── cache.ts         ← TTL-based session cache (getCachedHub/setCachedHub/clearCache)
├── index.ts         ← barrel exports
├── providers/       ← DataProvider adapters (GitHub, GitLab)
│   ├── github-provider.ts
│   └── gitlab-provider.ts
└── compute/         ← pure metric functions (30+)
    ├── pass-rate.ts
    ├── suite-speed.ts
    ├── flaky-rate.ts
    ├── trends.ts
    ├── scoring.ts
    └── ...
```

**Core types (`shared/types/data-hub.ts`):**

```typescript
interface DataHub {
    readonly raw: RawData;
    readonly computed: ComputedMetrics;
    readonly timestamp: Date;
    readonly provider: 'github' | 'gitlab';
    readonly repo: string;
}

interface DataProvider {
    readonly name: string;
    readonly source: 'github' | 'gitlab' | 'jira' | 'xray' | 'coverage';
    fetchRawData(options: FetchOptions): Promise<RawData>;
}
```

**Entry point (`shared/ci-data.ts`):**

```typescript
function getOrFetchDataHub(
    provider: GitProvider,
    repo: string
): Promise<DataHub | undefined>;
```

**Cache (`shared/data-hub/cache.ts`):**

```typescript
function getCachedHub(repo: string): DataHub | undefined;
function setCachedHub(repo: string, hub: DataHub): void;
function clearCache(): void;
// TTL: 5 minutes
```

**Consumidores:**
- `shared/health-score.ts` — `calculateHealthScore(metricsStore, { ciData })`
- `shared/quality-gate.ts` — `runQualityGate({ ciData })`
- `shared/pr-report-core.ts` — `generatePrReport({ ciData })` via `getOrFetchDataHub()`
- `shared/pipeline-cost.ts` — `calculatePipelineCost(runs, cpm, ciData)`
- `shared/traceability-matrix.ts` — `buildTraceabilityMatrix(metrics, coverage, ciData)`
- `git_triggers/interactive-mode.ts` — `ensureDataHub()` + `getDataHub()` for dashboards

**Fallback:** Quando `ciData` não disponível ou vazio, consumidores usam `MetricsStore` local.

**Menu:** Acessível via opção `h` no menu interativo do git_triggers.

### Coverage Types (`shared/types/coverage.ts`)

```typescript
interface CoverageGapItem {
    issueKey: string;
    summary: string;
    type: 'Story' | 'Task' | 'Bug' | 'Epic';
    status: string;
    epicKey?: string;
    epicSummary?: string;
    hasTest: boolean;
    linkedTestKeys: string[];
    priority: string;
    coverageWeight: number;
    lastRunPassed?: boolean;
    lastRunDate?: string;
}

interface EpicCoverage {
    epicSummary: string;
    total: number;
    covered: number;
    weightedPct: number;
    rawPct: number;
    gatePass: boolean;
    issues: CoverageGapItem[];
}

interface CoverageHierarchyNode {
    key: string;
    summary: string;
    type: 'Epic' | 'Story' | 'Task' | 'Bug';
    children: CoverageHierarchyNode[];
    totalIssues: number;
    coveredIssues: number;
    coveragePct: number;
}

interface CoverageSnapshot {
    timestamp: string;
    project: string;
    totalIssues: number;
    mappedIssues: number;
    coveragePct: number;
}

interface CoverageGapResult {
    items: CoverageGapItem[];
    totals: { totalIssues: number; covered: number; gap: number; weightedCoveragePct: number; rawCoveragePct: number };
    byEpic: Record<string, EpicCoverage>;
    gateConfig: { minCoveragePct: number; failingEpics: string[] };
    hierarchy: CoverageHierarchyNode[];
    trends: CoverageSnapshot[];
}

interface TestImpactResult {
    changedFiles: string[];
    impactedTests: ImpactedTest[];
    unaffected: { total: number; skippedDueTo: string[] };
    suggestedCommand?: string;
    confidence: 'high' | 'medium' | 'low';
}
interface ImpactedTest {
    testKey?: string;
    title: string;
    reason: string;
    matchMode: string;
    filePattern?: string;
}
interface TestSelectionJson {
    generatedAt: string;
    changedFiles: string[];
    impactedTests: Array<{ title: string; testKey?: string; reason: string; matchMode: string; filePattern?: string }>;
    suggestedCommand?: string;
    confidence: 'high' | 'medium' | 'low';
    conservative: boolean;
    smokeTests: string[];
}
```

### Bug / Health Score Types (`shared/types/bugs.ts`)

```typescript
interface BugReport {
    summary: string;
    description: string;
    source: 'automated' | 'manual';
    stepsToReproduce?: string[];
    expectedResult?: string;
    actualResult?: string;
    environment?: string;
    severity: 'trivial' | 'minor' | 'major' | 'critical';
    component?: string;
    llmEnrichment?: LLMEnrichment;
    linkedIssues?: Array<{ key: string; linkType: string }>;
    metadata?: { pipelineId?: string; branch?: string; commitSha?: string; provider?: string };
}

interface HealthScoreDimensions {
    passRate: HealthScoreDimensionResult;
    flakyRate: HealthScoreDimensionResult;
    coverage: HealthScoreDimensionResult;
    suiteSpeed: HealthScoreDimensionResult;
    executionRate: HealthScoreDimensionResult;
}
interface HealthScoreDimensionResult {
    score: number;
    status: 'pass' | 'fail';
}
interface HealthScoreResult {
    overall: number;
    grade: HealthScoreGrade;
    qualityGate: 'pass' | 'fail';
    dimensions: HealthScoreDimensions;
    provenance?: HealthScoreProvenanceEntry[];
    runCount: number;
    timestamp: string;
}
```

### LLM Types (`shared/types/llm.ts`)

```typescript
type LlmTier = 'main' | 'fast' | 'reviewer' | 'report' | 'fallback' | 'batch';
type ResponseFormat = 'text' | 'json';

interface LLMEnrichment {
    enrichedAt: string;
    model: string;
    suggestedFix?: string;
    rootCause?: string;
    confidence?: number;
}

interface LlmPromptOptions<S extends ZodSchema = never> {
    tier: LlmTier;
    system: string;
    user: string;
    callerId?: string;
    responseFormat?: ResponseFormat;
    schema?: S;
}

interface AiGenerationRecord {
    id: string;
    generatedAt: string;
    promptVersion: string;
    userStory: string;
    acceptanceCriteria: string;
    generatedTests: Array<{ title: string; preConditions: string[]; stepCount: number }>;
    preconditionMatches: Array<{ summary: string; matchType: string }>;
    feedback?: AiModification[];
}
interface AiModification {
    testKey: string;
    recordedAt: string;
    action: 'kept' | 'modified' | 'deleted';
    reason?: string;
}
```

### Jira Resource Types (`jira_management/jira-resource-types.ts`)

```typescript
interface VersionData {
    id: string;
    name: string;
    released?: boolean;
    releaseDate?: string;
    description?: string;
    [key: string]: unknown;
}
interface JiraIssue {
    key: string;
    fields: { summary?: string; status?: { name: string }; [key: string]: unknown };
}
interface SearchResponse {
    issues: JiraIssue[];
    total: number;
}

interface JiraResourceLike {
    getJiraResource<T>(resourceUrl: string): Promise<T>;
    postJiraResource(resourceUrl: string, data: unknown): Promise<JsonObject>;
    putJiraResource(resourceUrl: string, data: unknown): Promise<JsonObject | null>;
    log: Logger;
    getProjectId(projectName: string): Promise<string>;
    getProjectVersions(projectId: string): Promise<VersionData[]>;
    getVersionId(projectName: string, versionName: string): Promise<string | null>;
    searchJiraIssues(jql: string, maxResults?: number): Promise<SearchResponse>;
    getTransitionsForIssue(issueKey: string): Promise<Record<string, string>>;
    transitionIssue(issueId: string, transitionId: string): Promise<void>;
    checkReleaseTasksStatus(projectName: string, versionName: string): Promise<boolean>;
}
```

### CommandContext (DI) (`jira_management/commands/context.ts`)

```typescript
interface CommandContext extends SharedCommandContext {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    csvResource: CsvResource;
    packageManager?: PackageVersionManager;
}
```

### CLI Args (Git Triggers) (`git_triggers/cli-args.ts`)

```typescript
type CliMode = 'interactive' | 'batch' | 'help' | 'version';

interface BaseCliArgs {
    mode: CliMode;
    help: boolean;
    version: boolean;
    noClear: boolean;
}
interface BatchCliArgs extends BaseCliArgs {
    mode: 'batch';
    project?: string;
    branch?: string;
    auto: boolean;
    publish?: string;
    runImpactedTests: boolean;
    conservative: boolean;
    teKey?: string;
    dryRun: boolean;
}
interface InteractiveCliArgs extends BaseCliArgs {
    mode: 'interactive';
}
type CliArgs = BatchCliArgs | InteractiveCliArgs | HelpCliArgs | VersionCliArgs;
```

### Project / Multi-Project Types (`shared/types/project.ts`)

Single source of truth for the multi-project registry. `name` and `dir` are
mandatory (D1: `dir` is never omitted); the registry maps project name →
`ProjectEntry` (D2).

```typescript
const projectEntrySchema = z.object({
    name: z.string().min(1), // unique id (no '/', '..', '\')
    dir: z.string().min(1), // PROJECT_ROOT; artifacts/state resolve from here
    provider: z.string().optional(), // 'github' | 'gitlab'
    projectId: z.string().optional(), // 'org/repo' (GitHub) or numeric id (GitLab)
    jiraKey: z.string().optional(), // Jira/Xray project key
    framework: z.string().optional(), // detected test framework
    features: z.array(z.string()).optional(),
    migrated: z.boolean().optional(), // true = came from legacy→XDG migration (menu-protected)
});
type ProjectEntry = z.infer<typeof projectEntrySchema>;

// name -> ProjectEntry
const projectRegistrySchema = z.record(z.string(), projectEntrySchema);
type ProjectRegistry = z.infer<typeof projectRegistrySchema>;
```

Runtime propagation to child modules is via env vars: `QA_CURRENT_PROJECT`,
`QA_PROJECT_DIR`, plus the per-project overlay keys written by the Setup Wizard
(`QA_PROJECT_PROVIDER`, `QA_PROJECT_ID`, `QA_PROJECT_JIRA_KEY`,
`QA_PROJECT_FRAMEWORK`). A `--project <name>` flag skips interactive selection.

### Dependency Wall (`shared/deps.ts`)

```typescript
// All external imports go through this file
import chalk from 'chalk'; // color output
import axios from 'axios'; // HTTP client (wrapped by http-client.ts)
import AdmZip from 'adm-zip'; // ZIP handling
import cliProgress from 'cli-progress'; // progress bars
import CliTable3 from 'cli-table3'; // ASCII tables
import csv from 'csv-parser'; // CSV parsing
import dotenv from 'dotenv'; // .env loading
import figlet from 'figlet'; // ASCII splash
import readlineSync from 'readline-sync'; // sync prompts (legacy)
import yaml from 'yaml'; // YAML parsing
import zod from 'zod'; // validation schemas
import { globSync } from 'glob'; // file globbing

// ESM-only deps loaded dynamically: gradient-string, ora, @inquirer/*
```

### Invariants (`shared/invariants/index.ts`)

13 domain invariants (T-01 to T-13) + 5 structural invariants (I-01 to I-05):

| ID   | Rule                             | Purpose                                  |
| ---- | -------------------------------- | ---------------------------------------- |
| I-01 | `invariantNoPlaceholder`         | No placeholder text in test artifacts    |
| I-02 | `invariantNoMarkdown`            | No markdown in structured fields         |
| I-03 | `invariantEvidenceExists`        | Every test has evidence                  |
| I-04 | `invariantNoEmptyStrings`        | No empty strings in required fields      |
| I-05 | `invariantConclusionHasEvidence` | Every conclusion has supporting evidence |
| T-01 | `invariantCoverageComplete`      | Coverage must be complete                |
| T-02 | `invariantCoverageThreshold`     | Coverage must meet threshold             |
| T-03 | `invariantStateMutation`         | State mutations are tracked              |
| T-04 | `invariantConcreteSteps`         | Steps must be concrete (not abstract)    |
| T-05 | `invariantVerifiableResult`      | Results must be verifiable               |
| T-06 | `invariantUniqueTitles`          | Test titles must be unique               |
| T-07 | `invariantPreconditionsExist`    | Referenced preconditions must exist      |
| T-08 | `invariantResultMatchesAction`   | Result must match action                 |
| T-09 | `invariantNumericConsistency`    | Numeric values must be consistent        |
| T-10 | `invariantNoDuplicateTests`      | No duplicate test cases                  |
| T-11 | `invariantPartitionCoverage`     | Partition coverage must be adequate      |
| T-12 | `invariantBoundaryCoverage`      | Boundary coverage must be adequate       |
| T-13 | `invariantRedundancyCoupling`    | Redundancy/coupling must be balanced     |

---

## MODULE MAP

### `shared/` (306 files) — Core Library

| File                            | Purpose                                                | Key Exports                                                                       |
| ------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `deps.ts`                       | Dependency Wall — single import for all external deps  | `chalk`, `axios`, `zod`, etc                                                      |
| `config-accessor.ts`            | Config singleton (env > file > override)               | `Config` class                                                                    |
| `logger.ts`                     | Structured logger (console + file, rotation)           | `Logger`, `rootLogger`                                                            |
| `http-client.ts`                | Axios wrapper (retry, backoff, circuit-breaker)        | `createHttpClient()`                                                              |
| `jira-client.ts`                | Base Jira REST client                                  | `JiraClient` class                                                                |
| `state.ts`                      | Persisted JSON state, per-project + shared globals     | `loadTypedState()`, `update()`                                                    |
| `project-registry.ts`           | Multi-project registry (SSOT), CRUD over XDG store     | `loadRegistry()`, `saveRegistry()`, `addProject()`, `updateProject()`, `removeProject()`, `listProjects()`, `getProject()` |
| `project-context.ts`            | Active-project resolution & per-project config load    | `getCurrentProject()`, `setCurrentProject()`, `loadProjectConfig()`               |
| `project-paths.ts`              | XDG path helpers for registry/config/env/state         | `registryDir()`, `projectConfigDir()`, `projectEnvPath()`                         |
| `parse-project-flag.ts`         | Parse global `--project`/`-p` flag from argv           | `parseProjectFlag()`                                                              |
| `migration/migrate-projects.ts` | Atomic legacy→XDG cutover of `config/projects.json`    | `migrateLegacyProjects()`                                                         |
| `entry-menu.ts`                 | Project selection/management menu before module boot   | `selectProject()`, `_initInfrastructure()`                                        |
| `session-context.ts`            | Per-session context                                    | `SessionContext` class                                                            |
| `llm-client.ts`                 | Multi-tier LLM client (6 tiers)                        | `llmPrompt()`, `setModel()`                                                       |
| `llm-cache.ts`                  | LRU + disk cache for LLM responses                     | `LlmCache` class                                                                  |
| `llm-rate-limiter.ts`           | Per-tier rate limiting                                 | `LlmRateLimiter` class                                                            |
| `llm-fallback.ts`               | Fallback chain                                         | `LlmFallback` class                                                               |
| `circuit-breaker.ts`            | Circuit breaker pattern                                | `CircuitBreaker` class                                                            |
| `store.ts`                      | SHA-keyed git-backed report cache                      | `Store` class                                                                     |
| `store-backend.ts`              | Git storage backend                                    | `StoreBackend` class                                                              |
| `ci-data.ts`                    | CI Data Hub — entry point with cache                    | `getOrFetchDataHub()`                                                               |
| `data-hub/hub.ts`              | DataHubImpl — orchestration & factory                    | `DataHubImpl.create()`, `DataHubImpl.createEmpty()`                                |
| `data-hub/cache.ts`            | TTL-based session cache (5min)                          | `getCachedHub()`, `setCachedHub()`, `clearCache()`                                 |
| `data-hub/providers/`          | DataProvider adapters (GitHub, GitLab)                   | `GitHubDataProvider`, `GitLabDataProvider`                                         |
| `data-hub/compute/`            | Pure metric functions (30+)                             | `calcPassRate()`, `calcFlakyRate()`, `scorePassRate()`, etc.                       |
| `data-hub/persistence.ts`       | Metrics persistence (SSOT — replaces legacy `metrics.ts`) | `loadMetrics()`, `saveMetrics()` (delegated by `DataHub`)                     |
| `test-impact.ts`                | Three-tier test impact analysis                        | `analyzeTestImpact()`, `generateTestSelectionJson()`                              |
| `git-metrics-adapter.ts`        | Git history → MetricsRun[] adapter                     | `generateGitMetricsRuns()`, `generateGitFailureClassifications()`                 |
| `coverage-verifier.ts`          | Coverage recalculation (Layer 3)                       | `recalculateCoverage()`                                                           |
| `coverage-gap.ts`               | Coverage gap analysis                                  | `analyzeCoverageGaps()`                                                           |
| `generate-coverage-gap-html.ts` | Coverage gap HTML report generation                    | `generateCoverageGapHtml()`                                                       |
| `health-score.ts`               | Health score calculator                                | `calculateHealthScore()`                                                          |
| `validation.ts`                 | Zod validation wrapper                                 | `validate()`, `validateOrThrow()`                                                 |
| `palette.ts`                    | Chalk abstraction (color palette)                      | `palette` object                                                                  |
| `prompt.ts`                     | Terminal input/output facade                           | `prompt()`, `info()`, `title()`                                                   |
| `quarantine.ts`                 | Quarantine management for flaky tests                  | `quarantineTest()`, `isQuarantined()`, `generatePipelineQuarantine()`             |
| `defect-trend.ts`               | Defect trend dashboard HTML report                     | `aggregateDefectTrends()`, `generateDefectTrendHtml()`                            |
| `flakiness-dashboard.ts`        | Flakiness dashboard HTML report                        | `filterHighFlakiness()`, `generateFlakinessHtml()`                                |
| `defect-seasonality.ts`         | Defect seasonality dashboard HTML report               | `aggregateDefectSeasonality()`, `generateSeasonalityHtml()`                       |
| `markdown.ts`                   | Markdown lexer/renderer                                | `tokenize()`, `renderToHtml()`                                                    |
| `csrf/`                         | CSV parsing/validation                                 | `CsvResource`, schemas                                                            |
| `invariants/`                   | 13 domain + 5 structural invariant rules               | `createTestCaseValidator()`                                                       |
| `types/`                        | All shared type definitions                            | `common.ts`, `jira.ts`, `xray.ts`, `ci-cd.ts`, `coverage.ts`, `bugs.ts`, `llm.ts` |
| `prompts/`                      | LLM prompt templates (Markdown)                        | —                                                                                 |
| `test-utils/`                   | Test utilities (factories, mock types)                 | `MockedSafe<T>`, `mockedSafe()`                                                   |
| `run-comparison.ts`             | Compare two MetricsRun objects via LLM                 | `compareRuns()`                                                                   |
| `cross-squad-benchmark.ts`      | Cross-squad health score leaderboard with trends       | `computeCrossSquadBenchmark()`, `generateBenchmarkHtml()`                         |
| `developer-profile.ts`          | Developer profile failure breakdown dashboard          | `buildDeveloperProfile()`, `generateDeveloperProfileHtml()`                       |
| `report-*.ts`                   | Report generation (HTML, sections, tables, charts)     | `ReportGenerator`                                                                 |
| `silent-regression.ts`          | Silent regression detector                             | `detectSilentRegression()`, `generateSilentRegressionHtml()`                      |
| `ai-effectiveness.ts`           | AI effectiveness dashboard HTML report                 | `computeAiEffectiveness()`, `generateAiEffectivenessHtml()`                       |
| `ai-comparison.ts`              | AI vs manual test comparison dashboard                 | `compareAiVsManual()`, `generateAiComparisonHtml()`                               |
| `suite-optimization.ts`         | Suite optimization advisor for test duration/flakiness | `analyzeSuiteOptimization()`, `generateOptimizationHtml()`                        |
| `backlog-health.ts`             | Backlog health analysis (stale, unassigned, untested)  | `analyzeBacklogHealth()`, `generateBacklogHealthHtml()`                           |
| `markdown-html.ts`              | Markdown-to-HTML converter                             | `markdownToHtml()`                                                                |

### `jira_management/` (75 files) — Jira CLI App

| File                         | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `main.ts`                    | Entry point: init, DI, main loop                                     |
| `menu-data.ts`               | Menu tree definition (6 categories, sub-menus), aliases, help topics |
| `ui-helpers.ts`              | Menu display, choice dispatch, help/docs loop                        |
| `jira_resource.ts`           | Jira REST facade (extends `JiraClient`)                              |
| `jira-resource-sprint.ts`    | Sprint operations                                                    |
| `jira-resource-version.ts`   | Version operations                                                   |
| `jira_link_manager.ts`       | Issue link management                                                |
| `xray-client.ts`             | Xray Cloud/Server step import                                        |
| `create_tests.ts`            | CSV-to-Jira test creation                                            |
| `csv_resource.ts`            | CSV file parsing                                                     |
| `csv-import-schema.ts`       | CSV validation schemas (Zod)                                         |
| `import-orchestrator.ts`     | Import pipeline orchestration                                        |
| `import-loop.ts`             | Import loop (find/create issues)                                     |
| `issue-linker.ts`            | Issue linking logic                                                  |
| `coverage.ts`                | Coverage operations                                                  |
| `cypress_resource.ts`        | Cypress integration                                                  |
| `precondition-handler.ts`    | Pre-condition management                                             |
| `test-case-factory.ts`       | Test case factory                                                    |
| `test-execution-creator.ts`  | Test Execution creation                                              |
| `mapping-file-generator.ts`  | Test-to-Jira mapping                                                 |
| `package_version_manager.ts` | Package version sync                                                 |
| `dashboard-handlers.ts`      | Dashboard generation                                                 |
| `commands/context.ts`        | DI contract for handlers                                             |
| `commands/index.ts`          | Command registry (case01–case27 + caseD)                             |
| `commands/case01.ts`         | Import CSV → Create Test Cases                                       |
| `commands/case02.ts`         | View project versions from Jira                                      |
| `commands/case*.ts`          | Individual handlers (01–27)                                          |
| `constants.ts`               | User-facing messages (Portuguese)                                    |

### `git_triggers/` (62 files) — Git CLI App

| File                                        | Purpose                                   |
| ------------------------------------------- | ----------------------------------------- |
| `main.ts`                                   | Entry point: interactive + batch dispatch |
| `cli-args.ts`                               | CLI argument parser (discriminated union) |
| `cli-dispatch.ts`                           | Mode dispatcher                           |
| `interactive-mode.ts`                       | Interactive menu loop (920 lines)         |
| `batch-mode.ts`                             | Batch/CI mode                             |
| `session-state.ts`                          | Session context management                |
| `git-provider-base.ts`                      | Abstract base class                       |
| `gitlab_manager.ts`                         | GitLab API client                         |
| `github_manager.ts`                         | GitHub API client                         |
| `gitlab-api.ts` / `github-api.ts`           | Sub-operations per provider               |
| `gitlab-branch.ts` / `github-branch.ts`     | Branch operations                         |
| `gitlab-pr.ts` / `github-pr.ts`             | MR/PR operations                          |
| `gitlab-workflow.ts` / `github-workflow.ts` | Pipeline/workflow operations              |
| `gitlab-issues.ts` / `github-issues.ts`     | Issue operations                          |
| `pipeline-handler.ts`                       | Pipeline orchestration                    |
| `pipeline-health.ts`                        | Pipeline health monitoring                |
| `pipeline-jira.ts`                          | Jira + pipeline integration               |
| `mr-handler.ts`                             | Merge request handler                     |
| `nivelar.ts`                                | Branch leveling                           |
| `ai-pr-desc.ts`                             | AI-generated PR descriptions              |
| `ai-test-impact.ts`                         | AI test impact analysis                   |
| `llm-pipeline.ts`                           | LLM pipeline integration                  |
| `schedule-handler.ts`                       | Schedule management                       |
| `test-results.ts`                           | Test result processing                    |
| `ui-helpers.ts`                             | Terminal UI components                    |

### `setup/` (9 files) — Setup Wizard

| File               | Purpose                                                                             |
| ------------------ | ----------------------------------------------------------------------------------- |
| `main.ts`          | Interactive setup entry                                                             |
| `detector.ts`      | Framework detection (CI/CD)                                                         |
| `context.ts`       | Setup context types                                                                 |
| `config-writer.ts` | Config file generation                                                              |
| `templates/`       | CI pipeline templates (GitHub, GitLab, pre-push — setup-only, sem Config → Runtime) |

---

## CLI REFERENCE

### Jira Management (`npx tsx jira_management/main.ts`)

27 commands organized in 6 categories:

| ID  | Command                                | Category  | Description                                   |
| --- | -------------------------------------- | --------- | --------------------------------------------- |
| 1   | Criar testes a partir de CSV           | tests     | CSV → Jira Test issues via Xray               |
| 2   | Listar versões de release              | releases  | List project fix versions                     |
| 3   | Criar nova versão                      | releases  | Create fix version in Jira                    |
| 4   | Atribuir fixVersion às tarefas         | releases  | Assign fixVersion to issues                   |
| 5   | Atualizar package.json + release notes | releases  | Sync version across package.json + fixVersion |
| 6   | Verificar status das tarefas           | releases  | Check task completion status                  |
| 7   | Fechar tarefas automaticamente         | releases  | Bulk transition issues to Done                |
| 8   | Publicar versão                        | releases  | Release version + close                       |
| 9   | Alterar projeto Jira                   | config    | Switch active project                         |
| 10  | Alterar diretório git                  | config    | Set git directory                             |
| 11  | Gerar template CSV/JSON                | tests     | Generate sample test files                    |
| 12  | Diagnosticar conexão                   | config    | Test Jira/Xray connectivity                   |
| 13  | Criar Test Execution                   | tests     | Create TE for existing tests                  |
| 14  | Alterar diretório de testes            | config    | Set Cypress directory                         |
| 15  | Importar testes de JSON                | tests     | JSON → Jira Test issues                       |
| 16  | Alterar diretório JSON                 | config    | Set JSON directory                            |
| 17  | Gerar relatório HTML                   | reports   | Generate QA HTML report                       |
| 18  | Gerar testes via User Story (IA)       | tests     | AI-generated tests from US                    |
| 19  | Histórico / Cobertura                  | analytics | Coverage history dashboard                    |
| 20  | Criar Bug Report                       | bugreport | Create structured bug report                  |
| 21  | Análise de gaps de cobertura           | analytics | Coverage gap analysis                         |
| 22  | Impacto de mudanças                    | analytics | Test impact analysis                          |
| 23  | Feedback de IA                         | analytics | AI generation feedback                        |
| 24  | Setup wizard                           | config    | First-run configuration                       |
| 25  | Traceability Matrix                    | analytics | Requirements traceability                     |
| 26  | Release Score                          | analytics | Release health score                          |
| 27  | Coverage Dashboard                     | analytics | Coverage dashboard                            |
| d   | Dashboards individuais                 | reports   | Individual dashboard views                    |

**Flags:** `--help`, `--version`, `--no-clear`

**Portuguese aliases** para acesso rápido via digitação (ex: `criar=1`, `versões=2`, `cobertura=19`).

### Git Triggers (`npx tsx git_triggers/main.ts`)

**Modes:** Interactive (no flags) | Batch (`--auto` or any batch flag)

**Batch flags:**

| Flag                   | Description                      |
| ---------------------- | -------------------------------- |
| `--project, -p <name>` | Project name                     |
| `--branch, -b <name>`  | Branch name                      |
| `--auto, --batch`      | Headless CI/CD mode              |
| `--publish <target>`   | Publish reports (s3 \| gh-pages) |
| `--run-impacted-tests` | Run test impact selection        |
| `--conservative`       | Conservative mode                |
| `--dry-run`            | Show plan without running        |
| `--te-key, -k <key>`   | Test execution key for Jira      |

**Global:** `--help`, `--version`, `--no-clear`

**Global project selection (Jira & Git CLIs):** `--project, -p <name>` — parsed by
`parseProjectFlag()`; when present, skips the interactive entry-menu selection.
When absent, the entry-menu prompts for a project (no silent fallback).

### Setup Wizard (`npx tsx setup/main.ts`)

| Flag              | Description                                                    |
| ----------------- | ------------------------------------------------------------- |
| `--dir, -d <path>` | Register/configure a project located in another directory     |

Registers the project in the XDG registry (`addProject`), writes the per-project
`.env` overlay (`writeProjectEnvOverlay`), generates the CI pipeline and optional
pre-push hook. Prompts for an optional Jira project key.

---

## CONFIG & ENV

### Env Vars (124 vars, grouped by domain)

**Jira / Xray:**
`JIRA_BASE_URL`, `JIRA_PERSONAL_TOKEN`, `JIRA_MODE` (server|cloud), `JIRA_PROJECT`,
`XRAY_BASE_URL`, `XRAY_MODE` (server|cloud), `XRAY_CLIENT_ID`, `XRAY_CLIENT_SECRET`, `XRAY_CLOUD_URL`

**Git (GitLab):** `GIT_TOKEN`, `GIT_BASE_URL`
**Git (GitHub):** `GITHUB_TOKEN`, `GITHUB_API_URL`, `GITHUB_PR_NUMBER`

**Cypress:** `CYPRESS_PROJECT_PATH`

**CSV/JSON Import:** `CSV_DEFAULT_PATH`, `CSV_PATH`, `CSV_LABELS`, `JSON_PATH`, `JSON_LABELS`

**Behavior:**
`AUTO_CHOICE`, `AUTO_CONFIRM`, `DRY_RUN`, `DEBUG`, `QUIET`, `ON_ERROR` (abort|skip|continue),
`SKIP_FIRST_RUN`, `NO_COLOR`, `QA_TOOLS_NO_CLEAR`

**QA Tools:**
`QA_TOOLS_LOGS_DIR`, `QA_TOOLS_TEMP_DIR`, `QA_TOOLS_REPORTS_DIR`,
`QA_AUTO_BUG`, `QA_FAIL_ON`, `QA_PUBLISH` (s3|gh-pages), `QA_MAPPING_PATH`,
`BENCHMARK`, `QA_COST_PER_COMPUTE_MINUTE`, `AWS_S3_BUCKET`,
`QA_GATE_MIN_PASS_RATE`, `QA_GATE_MAX_FLAKY_PCT`, `QA_GATE_MIN_COVERAGE`, `QA_GATE_MAX_SUITE_SPEED`,
`QA_GIT_BLAME_IGNORE`, `METRICS_MAX_RUNS`, `REPORT_CACHE_MAX`

**Logging:** `LOG_LEVEL`, `LOG_FILE`, `LOG_DIR`, `LOG_MAX_SIZE`

**State:** `XDG_STATE_HOME`

**LLM (6 tiers):**
`LLM_PROVIDER`, `LLM_FALLBACK_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`,
`LLM_FAST_API_KEY`, `LLM_FAST_MODEL`, `LLM_FAST_BASE_URL`,
`LLM_REVIEW_API_KEY`, `LLM_REVIEW_MODEL`, `LLM_REVIEW_BASE_URL`,
`LLM_FALLBACK_API_KEY`, `LLM_FALLBACK_MODEL`, `LLM_FALLBACK_BASE_URL`,
`LLM_BATCH_API_KEY`, `LLM_BATCH_MODEL`, `LLM_BATCH_BASE_URL`,
`LLM_MAX_TOKENS_PER_OP`, `LLM_MAX_TOTAL_TOKENS`,
`LLM_REVIEW_BUDGET`, `LLM_REVIEW_STRATEGY` (selective|always),
`LLM_RATE_LIMIT`, `LLM_FETCH_RETRIES`,
`LLM_DISK_CACHE_DIR`, `LLM_CACHE_KEY`,
`LLM_DISCOVERY_MODE` (static|auto), `LLM_DISCOVERY_CACHE_TTL`

**CI/CD:** `CI`, `GITHUB_REPOSITORY`, `CI_JOB_NAME`, `GITHUB_WORKFLOW`, `CI_JOB_URL`, etc.

**Multi-project storage (SSOT):**

- **Registry:** `~/.config/qa-tools/projects.json` (`$XDG_CONFIG_HOME/qa-tools/projects.json` when set). Maps name → `ProjectEntry` (see Domain Model). Corrupt registry auto-restored from `projects.json.bak`.
- **Per-project env overlay:** `<projectDir>/.qa-tools/<name>.env`, written by the Setup Wizard and applied at runtime by `project-context` (`OVERRIDE_ENV_MAP`).
- **Per-project state:** `<xdgStateHome>/qa-tools/<name>/state.json`; shared global keys (`lastProject`, `_llm*`) in `<xdgStateHome>/qa-tools/global.json`.
- **Legacy migration:** on boot, `_initInfrastructure()` runs `migrateLegacyProjects()`, converting any old `config/projects.json` to `ProjectEntry` (`migrated: true`, `dir` = PROJECT_ROOT) and renaming the legacy file to `config/projects.json.migrated` (no dual-write; idempotent; throws on invalid name / corrupt JSON).
- **Runtime propagation env vars:** `QA_CURRENT_PROJECT`, `QA_PROJECT_DIR`, and overlay keys `QA_PROJECT_PROVIDER`, `QA_PROJECT_ID`, `QA_PROJECT_JIRA_KEY`, `QA_PROJECT_FRAMEWORK`. `--project <name>` skips interactive selection.

User-facing journey (select/add/manage) is documented in [`07-projetos-registry.md`](07-projetos-registry.md).

**Legacy `config/` files (post-migration):**

- `config/providers.json` — Git provider per project (**legacy**; prefer the `provider` field of the registry `ProjectEntry`)
- `config/reviewers.json` — Reviewer user IDs (per project)
- `config/features.json` — Per-project feature toggles (keyed by project name; e.g. `prReport`), Zod-validated via `shared/feature-config.ts`

---

## TESTING CONVENTIONS

| Attribute      | Value                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| Framework      | Vitest v4                                                                          |
| Runner         | `vitest run` (CI) / `vitest` (watch)                                               |
| Coverage       | V8 provider, thresholds: lines 90%, functions 91%, branches 80%, statements 90%    |
| Mock pattern   | `vi.spyOn()` (migrated from `vi.mocked()`, Sprint Baseline Zero)                   |
| Test factories | `shared/test-utils/` — factories + `MockedSafe<T>` type utility                    |
| Mocks          | `shared/__mocks__/` (store, config, logger), `jira_management/commands/__mocks__/` |
| Co-location    | Tests co-localized (`foo.test.ts` next to `foo.ts`) or in `__tests__/`             |
| E2E            | `e2e/` (24 files, conditional — skip if env not configured)                        |
| Name           | ~4541 tests (all passing)                                                          |

---

## KEY DECISIONS

| Decision                           | Rationale                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dependency Wall** (`deps.ts`)    | Single file audit trail for all external packages. ESLint `no-restricted-imports` enforces compliance. Swap 1 file to change implementation globally.                                               |
| **6 LLM tiers**                    | Each provider has different speed/cost/quality. Tiered routing: fast (Groq) for quick ops, main (OpenRouter) for quality, reviewer (Gemini) for deep analysis, batch (GitHub Models free) for bulk. |
| **Circuit Breaker + Rate Limiter** | Prevents cascading failures from LLM API outages. Independent per-tier state.                                                                                                                       |
| **Git-backed Store**               | Reports survive beyond local machine. SHA-keyed dedup. `[skip ci]` commits prevent CI loops.                                                                                                        |
| **Palette wrapper** (`palette.ts`) | Abstraction over `chalk` so color scheme can be swapped centrally.                                                                                                                                  |
| **Invariants (13 domain rules)**   | Type-level enforcement for test artifact quality. Each invariant has dedicated test. No workarounds allowed.                                                                                        |
| **Portuguese CLI**                 | Default UI language is Portuguese (aliases, menus, messages). English supported via env.                                                                                                            |
| **State persistence** (`state.ts`) | Per-project JSON in `<xdgStateHome>/qa-tools/<project>/state.json` + shared `global.json`, with automatic backup recovery. Isolates state per project; prevents data loss on crash.                   |
| **Project Registry (XDG SSOT)**    | Single registry at `~/.config/qa-tools/projects.json` replaces per-workspace `config/projects.json`/`providers.json`. One registration per project; `dir` mandatory (D1); legacy auto-migrated on boot (no dual-write). Enables true multi-project isolation. |
| **No web framework**               | Pure CLI — no Express, React, etc. Terminal UI via `@inquirer/*`, `chalk`, `cli-table3`.                                                                                                            |

---

## FEATURE WORKFLOW PATTERN (Padrão Oficial)

Toda feature que requer conexão com ferramentas externas, configuração por projeto, ou execução em CI/CD DEVE seguir o padrão:

```
Wizard (setup/) → Config (registry XDG + per-project .env overlay; config/features.json) → Runtime (shared/)
```

### Camadas

| Camada | Nome                   | Responsabilidade                                                                                                     |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1      | **Setup/Wizard**       | Coleta configuração do usuário uma vez (interativo). Detecta ambiente, pergunta opções, escreve config + CI template |
| 2      | **Config persistente** | Registro no registry XDG (`addProject`) + overlay `.env` por projeto + `config/features.json` + CI template gerado. A config determina o comportamento do runtime |
| 3      | **Runtime**            | Lê config, executa comportamento determinado. Sem hardcoded paths, sem flags manuais de CI                           |

### Critérios de Conformidade

- [ ] Wizard existe para configuração inicial (em `setup/main.ts` ou sub-wizard dedicado)
- [ ] Reconfiguração possível via menu (em `git_triggers/` ou `jira_management/`)
- [ ] Config persistente em `config/*.json` com schema validado (Zod)
- [ ] Runtime lê config — não depende de flags fixas ou env vars não documentadas
- [ ] CI template gerado automaticamente pelo wizard
- [ ] Suporte a GitHub e GitLab (quando aplicável)
- [ ] 100% de cobertura de testes para código novo

### Features Conformes vs Divergentes

| Feature                    | Conforme | Status                                          |
| -------------------------- | -------- | ----------------------------------------------- |
| Setup principal            | ✅       | Padrão de referência                            |
| SmartWizard LLM            | ✅       | Wizard dedicado em `scripts/smartwizard-llm.ts` |
| PR Report                  | 🔄       | Em correção ativa (17 gaps, 6 fases)            |
| Quality Gate               | ⚠️       | Parcial (env vars, sem wizard)                  |
| Test Impact Analysis       | ❌       | Sem wizard                                      |
| Flakiness Dashboard        | ⚠️       | Parcial (via env var)                           |
| Dashboards (case-25/26/27) | ⚠️       | Inline, sem wizard                              |

Features divergentes devem ser registradas no backlog para conformização.

### Publish Targets

| Target                                   | Provider | Status           |
| ---------------------------------------- | -------- | ---------------- |
| GitHub Actions (PR comment + check run)  | GitHub   | ✅ Ativo         |
| GitLab CI (MR comment + pipeline status) | GitLab   | 🔜 Implementação |
| AWS S3 (HTML report público)             | Ambos    | 📌 Futuro        |
| GitHub Pages (dashboard público)         | GitHub   | 📌 Futuro        |
| Slack (notificação automática)           | Ambos    | 📌 Futuro        |

---

## FILES & PATHS REFERENCE

| Path                                      | Purpose                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `<xdgStateHome>/qa-tools/<project>/state.json` | Per-project persisted session state (`.bak` backup alongside) |
| `<xdgStateHome>/qa-tools/global.json`     | Shared global state keys (`lastProject`, `_llm*`)                   |
| `<xdgStateHome>/qa-tools/state.json`      | Legacy single-file state (migrated to per-project on boot)          |
| `<projectDir>/.qa-tools/{reports,logs,artifacts}` | Per-project outputs (overridden by `QA_TOOLS_*_DIR`)       |
| `<projectDir>/.qa-tools/<name>.env`       | Per-project `.env` overlay (written by Setup Wizard)               |
| `~/.qa-tools/`                            | Logs, cache, temporary files                                       |
| `.env`                                    | Environment config (project root)                                  |
| `~/.config/qa-tools/projects.json`        | Registry multi-projeto (XDG); ver [`07-projetos-registry.md`](07-projetos-registry.md) |
| `config/providers.json`                   | Git provider per project (legado)                                  |
| `config/reviewers.json`                   | Reviewer user IDs                                                  |
| `config/features.json`                    | Feature toggles store (Zod-validated)                              |
| `shared/feature-config.ts`                | Feature config accessor — PR-Report-specific                       |
| `shared/types/feature-config.ts`          | Zod schemas + TypeScript types for feature store                   |
| `shared/developer-profile.ts`             | Developer profile failure breakdown dashboard                      |
| `shared/suite-optimization.ts`            | Suite optimization advisor (duration/flakiness analysis)           |
| `shared/backlog-health.ts`                | Backlog health analysis (stale/unassigned/untested)                |
| `shared/pipeline-cost.ts`                 | Pipeline cost analytics (cost/duration per run)                    |
| `shared/requirement-score.ts`             | Requirement quality score (AI-generated test acceptance/retention) |
| `shared/pr-report-core.ts`                | PR Report runtime (CLI entry point)                                |
| `shared/report-html.ts`                   | HTML report generator (sections, charts, themes)                   |
| `shared/parseArgs()`                      | CLI parser (--help, --project, unknown flag warn)                  |
| `git_triggers/pr-report-setup-handler.ts` | Reconfig handler (via git_triggers menu)                           |
| `.audit/`                                 | Generated audit reports (JSON + MD)                                |
| `coverage/`                               | Coverage reports (generated)                                       |
| `data/`                                   | Data files                                                         |
| `tmp/`                                    | Temporary files                                                    |
| `.llm-cache/`                             | LLM response cache (disk)                                          |
