/**
 * Artifact Content Specifications
 *
 * Defines EXACTLY what each HTML artifact must present, based on:
 * - ISTQB CTFL (requirement acceptance, test reporting)
 * - ISO/IEC 25010:2023 (product quality model)
 * - ISO/IEC 25023:2016 (quality measurement)
 * - DORA State of DevOps 2025 (software delivery performance)
 * - Google SRE Book (SLI/SLO/error budget, dashboards, reports)
 * - Allure Report 3 (test status, trends, severity, stability, coverage)
 *
 * This file is the SINGLE SOURCE OF TRUTH for content requirements.
 * Every renderer MUST implement ALL mandatory fields for its artifact.
 *
 * @module artifact-specs
 */

// ============================================================================
// TYPES
// ============================================================================

export type Severity = 'error' | 'warn' | 'info' | 'success' | 'default';

export type SectionType =
    | 'MetricGrid'
    | 'DataTable'
    | 'TrendChart'
    | 'RecommendedActions'
    | 'EmptyState'
    | 'BreakdownList'
    | 'QualityGate'
    | 'HierarchyTree'
    | 'AlertCards'
    | 'EventTimeline'
    | 'AuthorCards'
    | 'EpicCards'
    | 'CoverageTable'
    | 'FlakyTable'
    | 'DurationHistogram'
    | 'StatusChart'
    | 'SeverityChart'
    | 'TestingPyramid';

export type MetricFormat = 'number' | 'percentage' | 'currency' | 'duration' | 'badge' | 'grade' | 'datetime';

export interface MetricSpec {
    name: string;
    source: string;
    format: MetricFormat;
    severity: Severity;
    threshold?: number;
    thresholdOperator?: '<' | '<=' | '>' | '>=' | '==';
    sampleSizeWarning?: number;
    description: string;
}

export interface SectionSpec {
    name: string;
    type: SectionType;
    required: boolean;
    description: string;
}

export interface ActionSpec {
    condition: string;
    message: string;
    severity: 'error' | 'warn' | 'info';
}

export interface ArtifactSpec {
    id: string;
    purpose: string;
    auditor: string;
    reference: string[];
    metrics: MetricSpec[];
    sections: SectionSpec[];
    actions: ActionSpec[];
    timestamp: boolean;
    sampleSizeWarning: boolean;
    ssot: string;
    file: string;
}

// ============================================================================
// ARTIFACT SPECIFICATIONS (8 SURVIVING RENDERERS)
// ============================================================================

export const ARTIFACT_SPECS: ArtifactSpec[] = [
    // =========================================================================
    // 1. incident-report
    // =========================================================================
    {
        id: 'incident-report',
        purpose: 'Consolidar incidentes de qualidade (falhas, regressões, gaps de cobertura)',
        auditor: 'QA Manager, Release Manager',
        reference: ['Internal (fail rate threshold 30%, regression count 2)'],
        ssot: 'dataHub.computed.incidentEvents',
        file: 'shared/report/incident-report-renderer.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Overall Severity',
                source: 'result.overallSeverity',
                format: 'badge',
                severity: 'error',
                description: 'Severidade geral do incidente',
            },
            {
                name: 'Total Events',
                source: 'result.eventCount',
                format: 'number',
                severity: 'error',
                threshold: 5,
                thresholdOperator: '>',
                description: 'Total de eventos',
            },
            {
                name: 'High Severity',
                source: 'result.highCount',
                format: 'number',
                severity: 'error',
                threshold: 0,
                thresholdOperator: '>',
                description: 'Eventos de alta severidade',
            },
            {
                name: 'Medium Severity',
                source: 'result.mediumCount',
                format: 'number',
                severity: 'warn',
                threshold: 0,
                thresholdOperator: '>',
                description: 'Eventos de média severidade',
            },
            {
                name: 'Low Severity',
                source: 'result.lowCount',
                format: 'number',
                severity: 'info',
                description: 'Eventos de baixa severidade',
            },
        ],
        sections: [
            { name: 'Summary', type: 'MetricGrid', required: true, description: 'MetricGrid com as 5 métricas' },
            {
                name: 'Events Timeline',
                type: 'EventTimeline',
                required: true,
                description: 'Cards por evento com data, tipo, título, severidade, threshold',
            },
            {
                name: 'Per-Type Count Summary',
                type: 'MetricGrid',
                required: true,
                description: 'N failures, N regressions, N coverage gaps, N seasonality events',
            },
            {
                name: 'Recommended Actions',
                type: 'RecommendedActions',
                required: true,
                description: 'Ações condicionais',
            },
        ],
        actions: [
            {
                condition: 'highCount > 0',
                message: 'Critical incidents detected. Review recent code changes and test failures.',
                severity: 'error',
            },
            {
                condition: 'regressionCount > 0',
                message: '{N} regressions detected. Investigate recent deployments.',
                severity: 'warn',
            },
            {
                condition: 'coverageGapCount > 0',
                message: '{N} epics with coverage gaps. Add tests for uncovered requirements.',
                severity: 'warn',
            },
            {
                condition: 'lowCount > 0 && highCount === 0 && mediumCount === 0',
                message: 'Seasonality patterns detected. Consider test scheduling adjustments.',
                severity: 'info',
            },
        ],
    },

    // =========================================================================
    // 2. impact-alert
    // =========================================================================
    {
        id: 'impact-alert',
        purpose: 'Alertar sobre impacto do pipeline na qualidade',
        auditor: 'Release Manager, DevOps Lead',
        reference: ['Internal (quality gate 70%/80%)'],
        ssot: 'dataHub.computed.impactAlerts',
        file: 'shared/report/impact-alert-renderer.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Critical',
                source: 'result.criticalCount',
                format: 'number',
                severity: 'error',
                threshold: 0,
                thresholdOperator: '>',
                description: 'Alertas críticos',
            },
            {
                name: 'Warning',
                source: 'result.warningCount',
                format: 'number',
                severity: 'warn',
                threshold: 0,
                thresholdOperator: '>',
                description: 'Alertas de aviso',
            },
            {
                name: 'Info',
                source: 'result.infoCount',
                format: 'number',
                severity: 'info',
                description: 'Alertas informativos',
            },
            {
                name: 'Total Alerts',
                source: 'criticalCount + warningCount + infoCount',
                format: 'number',
                severity: 'error',
                threshold: 3,
                thresholdOperator: '>',
                description: 'Total de alertas',
            },
        ],
        sections: [
            { name: 'Summary', type: 'MetricGrid', required: true, description: 'MetricGrid com as 4 métricas' },
            {
                name: 'Alert Cards',
                type: 'AlertCards',
                required: true,
                description: 'Cards com severidade, título, mensagem, área afetada, recomendação',
            },
            {
                name: 'Recommended Actions',
                type: 'RecommendedActions',
                required: true,
                description: 'Ações condicionais',
            },
        ],
        actions: [
            {
                condition: 'criticalCount > 0',
                message: 'Critical pipeline impact. Immediate action required for: {areas}.',
                severity: 'error',
            },
            {
                condition: 'warningCount > 0',
                message: 'Pipeline warnings for: {areas}. Review before next release.',
                severity: 'warn',
            },
            { condition: 'allInfo', message: 'Pipeline health is acceptable. Continue monitoring.', severity: 'info' },
        ],
    },

    // =========================================================================
    // 3. backlog-health
    // =========================================================================
    {
        id: 'backlog-health',
        purpose: 'Avaliar saúde do backlog de testes',
        auditor: 'QA Lead, Product Owner',
        reference: ['ISTQB (requirement management)', 'ISO/IEC 25010 (functional suitability)'],
        ssot: 'dataHub.raw.jiraIssues',
        file: 'shared/report/backlog-health-renderer.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Health Score',
                source: 'result.score',
                format: 'number',
                severity: 'info',
                threshold: 80,
                thresholdOperator: '>=',
                description: 'Score de saúde (0-100)',
            },
            {
                name: 'Stale Issues',
                source: 'result.staleIssues.length',
                format: 'number',
                severity: 'warn',
                threshold: 0,
                thresholdOperator: '>',
                description: 'Issues sem atualização > 30 dias',
            },
            {
                name: 'Unassigned',
                source: 'result.unassignedIssues.length',
                format: 'number',
                severity: 'warn',
                threshold: 0,
                thresholdOperator: '>',
                description: 'Issues sem responsável',
            },
            {
                name: 'Bugs w/o Tests',
                source: 'result.bugsWithoutTests.length',
                format: 'number',
                severity: 'error',
                threshold: 0,
                thresholdOperator: '>',
                description: 'Bugs sem testes associados',
            },
            {
                name: 'Total Issues',
                source: 'result.totalIssues',
                format: 'number',
                severity: 'info',
                description: 'Total de issues no backlog',
            },
        ],
        sections: [
            { name: 'Summary', type: 'MetricGrid', required: true, description: 'MetricGrid com as 5 métricas' },
            {
                name: 'Stale Issues',
                type: 'DataTable',
                required: true,
                description: 'Lista de issues stale com key, summary, dias, badge',
            },
            {
                name: 'Density by Epic',
                type: 'DataTable',
                required: true,
                description: 'DataTable: Epic, Bugs, Tests, Ratio, Badge',
            },
            {
                name: 'Recommended Actions',
                type: 'RecommendedActions',
                required: true,
                description: 'Ações condicionais',
            },
        ],
        actions: [
            {
                condition: 'score < 50',
                message: 'Backlog health score is {X} (below 50). Immediate attention required.',
                severity: 'error',
            },
            {
                condition: 'staleIssues > 0',
                message: '{N} issues stale (> 30 days without update). Prioritize triage.',
                severity: 'warn',
            },
            {
                condition: 'bugsWithoutTests > 0',
                message: '{N} bugs without test coverage. Add tests for critical paths.',
                severity: 'warn',
            },
            {
                condition: 'unassigned > 0',
                message: '{N} unassigned issues. Assign owners to prevent backlog rot.',
                severity: 'warn',
            },
        ],
    },

    // =========================================================================
    // 4. pipeline-cost
    // =========================================================================
    {
        id: 'pipeline-cost',
        purpose: 'Analizar custos de execução do pipeline CI/CD',
        auditor: 'DevOps Lead, Engineering Manager',
        reference: ['DORA (software delivery performance)', 'Internal (cost optimization)'],
        ssot: 'dataHub.computed.perRunCosts',
        file: 'shared/quality/pipeline-cost-renderer.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Total Cost',
                source: 'result.totalCost',
                format: 'currency',
                severity: 'info',
                threshold: 100,
                thresholdOperator: '<',
                description: 'Custo total do pipeline',
            },
            {
                name: 'Avg Cost/Run',
                source: 'result.avgCostPerRun',
                format: 'currency',
                severity: 'info',
                threshold: 10,
                thresholdOperator: '<',
                description: 'Custo médio por run',
            },
            {
                name: 'Total Duration',
                source: 'result.totalDuration',
                format: 'duration',
                severity: 'info',
                description: 'Duração total',
            },
            {
                name: 'Run Count',
                source: 'result.runCount',
                format: 'number',
                severity: 'info',
                description: 'Número de runs',
            },
            {
                name: 'Cost/Minute',
                source: 'result.costPerMinute',
                format: 'currency',
                severity: 'info',
                description: 'Custo por minuto',
            },
        ],
        sections: [
            { name: 'Summary', type: 'MetricGrid', required: true, description: 'MetricGrid com as 5 métricas' },
            {
                name: 'Cost per Run Table',
                type: 'DataTable',
                required: true,
                description: 'DataTable: Run, Duration, Cost, Status Badge, sorted by cost desc',
            },
            {
                name: 'Recommended Actions',
                type: 'RecommendedActions',
                required: true,
                description: 'Ações condicionais',
            },
        ],
        actions: [
            {
                condition: 'avgCost > 20',
                message: 'Average cost per run is ${X}. Consider optimizing CI/CD pipeline.',
                severity: 'warn',
            },
            {
                condition: 'longRuns > 0',
                message: '{N} runs exceeded 30 minutes. Review for parallelization opportunities.',
                severity: 'warn',
            },
            {
                condition: 'totalCost > 100',
                message: 'Total cost is ${X}. Review pipeline efficiency.',
                severity: 'warn',
            },
        ],
    },

    // =========================================================================
    // 5. release-score
    // =========================================================================
    {
        id: 'release-score',
        purpose: 'Avaliar prontidão para release',
        auditor: 'Release Manager, QA Manager',
        reference: ['Google SRE (SLO/error budget)', 'DORA (deployment readiness)'],
        ssot: 'dataHub.computed.releaseScore',
        file: 'shared/quality/release-score-renderer.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Release Gate',
                source: 'result.score >= 80 ? "READY" : "NOT READY"',
                format: 'badge',
                severity: 'info',
                threshold: 80,
                thresholdOperator: '>=',
                description: 'Gate de release (✅/❌)',
            },
            {
                name: 'Score',
                source: 'result.score',
                format: 'percentage',
                severity: 'info',
                threshold: 80,
                thresholdOperator: '>=',
                description: 'Score de release (0-100)',
            },
            {
                name: 'Grade',
                source: 'result.grade',
                format: 'grade',
                severity: 'info',
                description: 'Grade (A/B/C/D/F)',
            },
            {
                name: 'Checks Passed',
                source: 'result.breakdown.filter(b => b.status === "pass").length',
                format: 'number',
                severity: 'info',
                description: 'Checks aprovados',
            },
        ],
        sections: [
            { name: 'Summary', type: 'MetricGrid', required: true, description: 'MetricGrid com as 4 métricas' },
            {
                name: 'Breakdown',
                type: 'BreakdownList',
                required: true,
                description: 'DataTable: Dimension, Score, Status Badge, Threshold Hint, Weight',
            },
            {
                name: 'Recommendation',
                type: 'RecommendedActions',
                required: true,
                description: 'Texto de recomendação do result.recommendation',
            },
            {
                name: 'Recommended Actions',
                type: 'RecommendedActions',
                required: true,
                description: 'Ações condicionais',
            },
        ],
        actions: [
            {
                condition: 'score < 50',
                message: 'Release score is {X}% — critically low. Do NOT deploy until score reaches 50%.',
                severity: 'error',
            },
            {
                condition: 'score >= 50 && score < 80',
                message: 'Release score is {X}% — below the 80% quality gate.',
                severity: 'warn',
            },
            {
                condition: 'failedChecks > 0',
                message: '{N} check(s) failed: {names}. Review and fix before release.',
                severity: 'warn',
            },
            {
                condition: 'score >= 80',
                message: 'Release score meets quality thresholds. Ready for deployment.',
                severity: 'info',
            },
        ],
    },

    // =========================================================================
    // 6. defect-trend
    // =========================================================================
    {
        id: 'defect-trend',
        purpose: 'Analisar tendências de defeitos ao longo do tempo',
        auditor: 'QA Manager, Product Owner',
        reference: ['ISO/IEC 25010 (reliability)', 'DORA (change failure rate)'],
        ssot: 'dataHub.computed.defectTrends',
        file: 'shared/quality/defect-trend-renderer.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Top Category',
                source: 'result.topCategory',
                format: 'badge',
                severity: 'info',
                description: 'Categoria com mais defeitos',
            },
            {
                name: 'Total Defects',
                source: 'result.totalDefects',
                format: 'number',
                severity: 'info',
                description: 'Total de defeitos',
            },
            {
                name: 'Trend Direction',
                source: 'result.trendDirection',
                format: 'badge',
                severity: 'error',
                description: 'Direção da tendência (increasing/decreasing)',
            },
            {
                name: 'Avg Defects/Day',
                source: 'result.avgDefectsPerDay',
                format: 'number',
                severity: 'info',
                threshold: 10,
                thresholdOperator: '<',
                description: 'Média de defeitos por dia',
            },
        ],
        sections: [
            { name: 'Summary', type: 'MetricGrid', required: true, description: 'MetricGrid com as 4 métricas' },
            {
                name: 'Trend Table',
                type: 'DataTable',
                required: true,
                description: 'DataTable: Date, Total, per-category columns, spike badge (> 1.5x avg)',
            },
            {
                name: 'Recommended Actions',
                type: 'RecommendedActions',
                required: true,
                description: 'Ações condicionais',
            },
        ],
        actions: [
            {
                condition: 'trendDirection === "increasing"',
                message: 'Defect trend is increasing. Investigate root cause.',
                severity: 'warn',
            },
            {
                condition: 'trendDirection === "decreasing"',
                message: 'Defect trend is decreasing. Quality is improving.',
                severity: 'info',
            },
            {
                condition: 'spikeDetected',
                message: 'Spike detected on {date}: {N} defects ({X}% above average).',
                severity: 'warn',
            },
        ],
    },

    // =========================================================================
    // 7. defect-seasonality
    // =========================================================================
    {
        id: 'defect-seasonality',
        purpose: 'Analisar padrões sazonais de defeitos',
        auditor: 'QA Manager, Release Manager',
        reference: ['ISO 3534-2 (statistical process control)', 'DORA (software delivery performance)'],
        ssot: 'dataHub.raw.failureClassifications',
        file: 'shared/quality/defect-seasonality-renderer.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Peak Day',
                source: 'result.peakDay',
                format: 'badge',
                severity: 'info',
                description: 'Dia da semana com mais defeitos',
            },
            {
                name: 'Peak Hour',
                source: 'result.peakHour',
                format: 'badge',
                severity: 'info',
                description: 'Hora com mais defeitos',
            },
            {
                name: 'Total Records',
                source: 'result.totalRecords',
                format: 'number',
                severity: 'info',
                description: 'Total de registros',
            },
            {
                name: 'Avg Defects/Day',
                source: 'result.avgDefectsPerDay',
                format: 'number',
                severity: 'info',
                description: 'Média de defeitos por dia',
            },
        ],
        sections: [
            { name: 'Summary', type: 'MetricGrid', required: true, description: 'MetricGrid com as 4 métricas' },
            {
                name: 'Day of Week Table',
                type: 'DataTable',
                required: true,
                description: 'DataTable: Day, Total, vs-Avg badge (> 1.2x: 🔴, < 0.8x: 🟡, normal: 🟢)',
            },
            {
                name: 'Hour of Day Table',
                type: 'DataTable',
                required: true,
                description: 'DataTable: Hour, Total, vs-Avg badge, per-category',
            },
            {
                name: 'Recommended Actions',
                type: 'RecommendedActions',
                required: true,
                description: 'Ações condicionais',
            },
        ],
        actions: [
            {
                condition: 'highConcentrationHours > 0',
                message: 'High defect concentration during hours: {hours}. Consider test scheduling.',
                severity: 'warn',
            },
            {
                condition: 'peakDayHigh',
                message: 'Peak day ({day}) has {X}% more defects than average.',
                severity: 'info',
            },
        ],
    },

    // =========================================================================
    // 8. developer-profile
    // =========================================================================
    {
        id: 'developer-profile',
        purpose: 'Perfil de qualidade por desenvolvedor',
        auditor: 'QA Lead, Engineering Manager',
        reference: ['ISTQB (defect attribution)', 'DORA (team performance)'],
        ssot: 'dataHub.raw.failureRecords',
        file: 'shared/quality/developer-profile-renderer.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Total Authors',
                source: 'result.totalAuthors',
                format: 'number',
                severity: 'info',
                description: 'Total de autores',
            },
            {
                name: 'Total Failures',
                source: 'result.totalFailures',
                format: 'number',
                severity: 'info',
                description: 'Total de falhas',
            },
            {
                name: 'Top Contributor',
                source: 'result.topContributor',
                format: 'badge',
                severity: 'info',
                description: 'Autor com mais contribuições',
            },
            {
                name: 'Top Failure Author',
                source: 'result.topFailureAuthor',
                format: 'badge',
                severity: 'error',
                threshold: 30,
                thresholdOperator: '<',
                description: 'Autor com mais falhas',
            },
        ],
        sections: [
            { name: 'Summary', type: 'MetricGrid', required: true, description: 'MetricGrid com as 4 métricas' },
            {
                name: 'Author Ranking',
                type: 'AuthorCards',
                required: true,
                description: 'Cards: Rank, Author, Failures, Tests Touched, Failure Rate, Top Category',
            },
            {
                name: 'Category Ranking',
                type: 'DataTable',
                required: true,
                description: 'Contagem de falhas por categoria',
            },
            {
                name: 'Recommended Actions',
                type: 'RecommendedActions',
                required: true,
                description: 'Ações condicionais',
            },
        ],
        actions: [
            {
                condition: 'topFailureRate > 30',
                message: 'Author {name} has {X}% failure rate. Consider pairing or training.',
                severity: 'warn',
            },
            {
                condition: 'topCategoryHigh',
                message: 'Category {name} has {N} failures. Focus testing improvements here.',
                severity: 'info',
            },
        ],
    },
];

// ============================================================================
// ARTIFACT SPECIFICATIONS (7 RECONSTRUCTED / ORCHESTRATOR ARTIFACTS)
// ============================================================================

export const ADDITIONAL_ARTIFACT_SPECS: ArtifactSpec[] = [
    // =========================================================================
    // 1. coverage-gap
    // =========================================================================
    {
        id: 'coverage-gap',
        purpose: 'Analisar gaps de cobertura de testes em requirements',
        auditor: 'QA Lead, Product Owner',
        reference: ['ISO/IEC 25023 (coverage measurement)', 'ISTQB (requirements coverage)'],
        ssot: 'CoverageGapResult (external)',
        file: 'shared/report/generate-coverage-gap-html.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Total Issues',
                source: 'result.totals.totalIssues',
                format: 'number',
                severity: 'info',
                description: 'Total de issues',
            },
            {
                name: 'Covered',
                source: 'result.totals.covered',
                format: 'number',
                severity: 'success',
                description: 'Issues com cobertura',
            },
            {
                name: 'Gaps',
                source: 'result.totals.gap',
                format: 'number',
                severity: 'error',
                description: 'Issues sem cobertura',
            },
            {
                name: 'Weighted Coverage',
                source: 'result.totals.weightedCoveragePct',
                format: 'percentage',
                severity: 'info',
                threshold: 50,
                thresholdOperator: '>=',
                description: 'Cobertura ponderada',
            },
            {
                name: 'Raw Coverage',
                source: 'result.totals.rawCoveragePct',
                format: 'percentage',
                severity: 'info',
                threshold: 50,
                thresholdOperator: '>=',
                description: 'Cobertura bruta',
            },
        ],
        sections: [
            { name: 'Summary', type: 'MetricGrid', required: true, description: 'MetricGrid com as 5 métricas' },
            {
                name: 'Quality Gate',
                type: 'QualityGate',
                required: true,
                description: 'Pass/Fail baseado em threshold',
            },
            {
                name: 'Coverage by Epic',
                type: 'EpicCards',
                required: true,
                description: 'Cards por epic com progress bar',
            },
            {
                name: 'Hierarchy',
                type: 'HierarchyTree',
                required: true,
                description: 'Árvore colapsável epic→feature→story',
            },
            {
                name: 'Coverage Gaps',
                type: 'CoverageTable',
                required: true,
                description: 'Tabela de issues sem cobertura com filtro',
            },
        ],
        actions: [
            {
                condition: 'failingEpics > 0',
                message: '{N} epic(s) below {X}% threshold. Add tests for uncovered epics.',
                severity: 'error',
            },
            {
                condition: 'gaps > 0',
                message: '{N} issues without test coverage. Prioritize based on priority weight.',
                severity: 'warn',
            },
        ],
    },

    // =========================================================================
    // 2. report-html (orchestrator)
    // =========================================================================
    {
        id: 'report-html',
        purpose: 'Orquestrador principal de HTML — gera relatório completo de testes',
        auditor: 'QA Lead, Developer',
        reference: ['ISTQB (test completion report)', 'Allure Report (test report structure)'],
        ssot: 'FlatTest[] + ReportOptions',
        file: 'shared/report/report-html.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Passed',
                source: 'tests.filter(t => t.status === "passed").length',
                format: 'number',
                severity: 'success',
                description: 'Testes aprovados',
            },
            {
                name: 'Failed',
                source: 'tests.filter(t => t.status === "failed").length',
                format: 'number',
                severity: 'error',
                description: 'Testes falhos',
            },
            {
                name: 'Skipped',
                source: 'tests.filter(t => t.status === "skipped").length',
                format: 'number',
                severity: 'warn',
                description: 'Testes pulados',
            },
            {
                name: 'Pass Rate',
                source: 'passed/total',
                format: 'percentage',
                severity: 'info',
                description: 'Taxa de aprovação',
            },
            {
                name: 'Duration',
                source: 'tests.reduce((sum, t) => sum + t.duration, 0)',
                format: 'duration',
                severity: 'info',
                description: 'Duração total',
            },
        ],
        sections: [
            {
                name: 'Summary',
                type: 'MetricGrid',
                required: true,
                description: 'MetricGrid com pass/fail/skip/rate/duration',
            },
            {
                name: 'Failed Tests',
                type: 'DataTable',
                required: true,
                description: 'Tabela de testes falhos com detalhes',
            },
            { name: 'Charts', type: 'StatusChart', required: true, description: 'Gráfico de barras de resultados' },
            { name: 'Trends', type: 'TrendChart', required: true, description: 'Dados históricos de tendência' },
            { name: 'Quality Gate', type: 'QualityGate', required: true, description: 'Pass rate vs threshold' },
            { name: 'Health Score', type: 'MetricGrid', required: true, description: 'Health score do projeto' },
            {
                name: 'Test Table',
                type: 'DataTable',
                required: true,
                description: 'Tabela completa de testes com filtros',
            },
            { name: 'Diff Comparison', type: 'DataTable', required: true, description: 'Novas falhas, fixes, flaky' },
            { name: 'Timeline', type: 'TrendChart', required: true, description: 'Linha do tempo de execução' },
        ],
        actions: [
            {
                condition: 'failed > 0',
                message: '{N} tests failed. Review failed tests and fix root causes.',
                severity: 'error',
            },
            { condition: 'passRate < 95', message: 'Pass rate is {X}%. Target is >= 95%.', severity: 'warn' },
            {
                condition: 'flakyTests > 0',
                message: '{N} flaky tests detected. Consider quarantine.',
                severity: 'warn',
            },
        ],
    },

    // =========================================================================
    // 3. schedule-handler (weekly report)
    // =========================================================================
    {
        id: 'schedule-handler',
        purpose: 'Relatório semanal de qualidade — consolida TODOS os dashboards',
        auditor: 'QA Manager, Engineering Director',
        reference: ['ISTQB (test completion report)', 'DORA (software delivery performance)'],
        ssot: 'DataHub (all computed metrics)',
        file: 'git_triggers/schedule-handler.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Quality Gate',
                source: 'result.qualityGate',
                format: 'badge',
                severity: 'info',
                description: 'Gate de qualidade geral',
            },
            {
                name: 'Cross-Squad Score',
                source: 'result.crossSquad.averageScore',
                format: 'number',
                severity: 'info',
                description: 'Score médio entre squads',
            },
            {
                name: 'Defect Trend',
                source: 'result.defectTrend',
                format: 'badge',
                severity: 'info',
                description: 'Tendência de defeitos',
            },
            {
                name: 'Release Score',
                source: 'result.releaseScore',
                format: 'number',
                severity: 'info',
                description: 'Score de release',
            },
        ],
        sections: [
            { name: 'Quality Gate', type: 'QualityGate', required: true, description: 'Quality gate geral' },
            {
                name: 'Cross-Squad Benchmark',
                type: 'MetricGrid',
                required: true,
                description: 'Score médio, range, top/bottom',
            },
            {
                name: 'Defect Seasonality',
                type: 'DataTable',
                required: true,
                description: 'Padrões sazonais de defeitos',
            },
            {
                name: 'Release Score',
                type: 'MetricGrid',
                required: true,
                description: 'Score, grade, checks, deployment',
            },
            {
                name: 'Defect Trends',
                type: 'DataTable',
                required: true,
                description: 'Tendências de defeitos ao longo do tempo',
            },
            {
                name: 'Silent Regression',
                type: 'DataTable',
                required: true,
                description: 'Regressões silenciosas detectadas',
            },
            {
                name: 'Traceability Matrix',
                type: 'HierarchyTree',
                required: true,
                description: 'Rastreabilidade requirements→tests',
            },
            { name: 'AI Effectiveness', type: 'MetricGrid', required: true, description: 'Eficácia da geração AI' },
            { name: 'AI Comparison', type: 'MetricGrid', required: true, description: 'Comparação AI vs manual' },
            {
                name: 'Developer Profile',
                type: 'AuthorCards',
                required: true,
                description: 'Perfil de qualidade por dev',
            },
            {
                name: 'Suite Optimization',
                type: 'MetricGrid',
                required: true,
                description: 'Oportunidades de otimização',
            },
            { name: 'Backlog Health', type: 'MetricGrid', required: true, description: 'Saúde do backlog' },
            { name: 'Incident Report', type: 'EventTimeline', required: true, description: 'Incidentes consolidados' },
            { name: 'Pipeline Impact', type: 'MetricGrid', required: true, description: 'Impacto do pipeline' },
            { name: 'Pipeline Cost', type: 'MetricGrid', required: true, description: 'Custos do pipeline' },
            { name: 'Requirement Score', type: 'MetricGrid', required: true, description: 'Score dos requirements' },
        ],
        actions: [
            {
                condition: 'qualityGate === "fail"',
                message: 'Weekly quality gate FAILED. Review critical issues.',
                severity: 'error',
            },
            {
                condition: 'crossSquadStdDev > 20',
                message: 'High variance between squads ({X}). Standardize practices.',
                severity: 'warn',
            },
            {
                condition: 'defectTrendIncreasing',
                message: 'Defect trend is increasing over the week.',
                severity: 'warn',
            },
            {
                condition: 'releaseScore < 80',
                message: 'Release score is {X}%. Address remaining issues.',
                severity: 'warn',
            },
        ],
    },

    // =========================================================================
    // 4. interactive-mode (quality gate dashboard)
    // =========================================================================
    {
        id: 'interactive-mode',
        purpose: 'Dashboard interativo de quality gate — CLI menu',
        auditor: 'Developer, QA Lead',
        reference: ['Google SRE (error budget)', 'DORA (software delivery performance)'],
        ssot: 'DataHub (all computed metrics)',
        file: 'git_triggers/interactive-mode.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Quality Gate',
                source: 'result.qualityGate',
                format: 'badge',
                severity: 'info',
                description: 'Gate de qualidade',
            },
            {
                name: 'Pass Rate',
                source: 'result.passRate',
                format: 'percentage',
                severity: 'info',
                description: 'Taxa de aprovação',
            },
            {
                name: 'Error Budget',
                source: 'result.errorBudget',
                format: 'percentage',
                severity: 'info',
                description: 'Budget de erro restante',
            },
        ],
        sections: [
            { name: 'Quality Gate', type: 'QualityGate', required: true, description: 'Quality gate com status' },
            {
                name: 'Summary Metrics',
                type: 'MetricGrid',
                required: true,
                description: 'Métricas resumidas do projeto',
            },
            {
                name: 'Dashboard Links',
                type: 'RecommendedActions',
                required: true,
                description: 'Links para todos os dashboards',
            },
        ],
        actions: [
            {
                condition: 'qualityGate === "fail"',
                message: 'Quality gate FAILED. Fix critical issues before proceeding.',
                severity: 'error',
            },
            {
                condition: 'errorBudget < 10',
                message: 'Error budget is {X}%. Freeze non-critical changes.',
                severity: 'warn',
            },
        ],
    },

    // =========================================================================
    // 5. PR Report — Markdown Comment
    // =========================================================================
    {
        id: 'pr-report-markdown',
        purpose: 'Comentário Markdown no PR — resumo de testes para revisão',
        auditor: 'Developer, Tech Lead',
        reference: ['ISTQB (defect report)', 'DORA (code review quality)'],
        ssot: 'DataHub (mandatory)',
        file: 'shared/pr-report-core.ts',
        timestamp: true,
        sampleSizeWarning: true,
        metrics: [
            {
                name: 'Pass Rate',
                source: 'hub.computed.passRate',
                format: 'percentage',
                severity: 'info',
                description: 'Taxa de aprovação do PR',
            },
            {
                name: 'Passed',
                source: 'summary.passed',
                format: 'number',
                severity: 'success',
                description: 'Testes aprovados',
            },
            {
                name: 'Failed',
                source: 'summary.failed',
                format: 'number',
                severity: 'error',
                description: 'Testes falhos',
            },
            {
                name: 'Skipped',
                source: 'summary.skipped',
                format: 'number',
                severity: 'warn',
                description: 'Testes pulados',
            },
            {
                name: 'Duration',
                source: 'summary.duration',
                format: 'duration',
                severity: 'info',
                description: 'Duração total',
            },
        ],
        sections: [
            { name: 'CI Context', type: 'MetricGrid', required: true, description: 'Workflow URL, branch, repo' },
            {
                name: 'Summary Table',
                type: 'DataTable',
                required: true,
                description: 'Pass rate, passed/failed/skipped/duration',
            },
            { name: 'Diff Comparison', type: 'DataTable', required: true, description: 'Novas falhas, fixes, flaky' },
            { name: 'Coverage Section', type: 'MetricGrid', required: true, description: 'Cobertura do DataHub' },
            {
                name: 'Failed Tests Table',
                type: 'DataTable',
                required: true,
                description: 'Tabela truncada (max 50 rows)',
            },
            { name: 'AI Analysis', type: 'EmptyState', required: true, description: 'Placeholder para análise AI' },
            { name: 'Quality Gate', type: 'QualityGate', required: true, description: 'Score, checks, thresholds' },
            { name: 'Flaky Tests', type: 'FlakyTable', required: true, description: 'Taxa >= 30%, quarantine status' },
            {
                name: 'Data Quality',
                type: 'EmptyState',
                required: true,
                description: 'Awareness de qualidade dos dados',
            },
            {
                name: 'Footer',
                type: 'RecommendedActions',
                required: true,
                description: 'Workflow link, HTML artifact link, methodology',
            },
        ],
        actions: [
            { condition: 'failed > 0', message: '{N} tests failed. Review and fix before merging.', severity: 'error' },
            { condition: 'newFailures > 0', message: '{N} new failures introduced by this PR.', severity: 'error' },
            {
                condition: 'flakyTests > 0',
                message: '{N} flaky tests detected. Consider quarantine.',
                severity: 'warn',
            },
            {
                condition: 'qualityGate === "fail"',
                message: 'Quality gate FAILED. Address critical issues.',
                severity: 'error',
            },
        ],
    },

    // =========================================================================
    // 6. PR Report — Job Summary
    // =========================================================================
    {
        id: 'pr-report-job-summary',
        purpose: 'Job Summary do GitHub Actions — visão compacta',
        auditor: 'Developer, DevOps',
        reference: ['DORA (CI/CD feedback loop)', 'GitHub Actions best practices'],
        ssot: 'DataHub (mandatory)',
        file: 'shared/pr-report-core.ts',
        timestamp: true,
        sampleSizeWarning: true,
        metrics: [
            {
                name: 'Pass Rate',
                source: 'hub.computed.passRate',
                format: 'percentage',
                severity: 'info',
                description: 'Taxa de aprovação',
            },
            {
                name: 'Failed',
                source: 'summary.failed',
                format: 'number',
                severity: 'error',
                description: 'Testes falhos',
            },
        ],
        sections: [
            { name: 'Compact Table', type: 'DataTable', required: true, description: 'Visão compacta de uma tabela' },
            {
                name: 'HTML Artifact Link',
                type: 'RecommendedActions',
                required: true,
                description: 'Link para download do HTML artifact',
            },
        ],
        actions: [
            { condition: 'failed > 0', message: '{N} tests failed. Check PR comment for details.', severity: 'error' },
        ],
    },

    // =========================================================================
    // 7. PR Report — HTML Artifact
    // =========================================================================
    {
        id: 'pr-report-html',
        purpose: 'Relatório HTML completo do PR — artifact para download',
        auditor: 'QA Lead, Tech Lead',
        reference: ['ISTQB (test completion report)', 'Allure Report (full report)'],
        ssot: 'DataHub (mandatory)',
        file: 'shared/report/report-html.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Passed',
                source: 'tests.filter(t => t.status === "passed").length',
                format: 'number',
                severity: 'success',
                description: 'Testes aprovados',
            },
            {
                name: 'Failed',
                source: 'tests.filter(t => t.status === "failed").length',
                format: 'number',
                severity: 'error',
                description: 'Testes falhos',
            },
            {
                name: 'Pass Rate',
                source: 'passed/total',
                format: 'percentage',
                severity: 'info',
                description: 'Taxa de aprovação',
            },
        ],
        sections: [
            {
                name: 'Summary',
                type: 'MetricGrid',
                required: true,
                description: 'MetricGrid com pass/fail/skip/rate/duration',
            },
            {
                name: 'Failed Tests',
                type: 'DataTable',
                required: true,
                description: 'Tabela de testes falhos com detalhes',
            },
            { name: 'Charts', type: 'StatusChart', required: true, description: 'Gráfico de barras de resultados' },
            { name: 'Quality Gate', type: 'QualityGate', required: true, description: 'Pass rate vs threshold' },
            { name: 'Flakiness', type: 'FlakyTable', required: true, description: 'Testes flaky' },
            { name: 'Diff Comparison', type: 'DataTable', required: true, description: 'Novas falhas, fixes, flaky' },
        ],
        actions: [
            {
                condition: 'failed > 0',
                message: '{N} tests failed. Review the full report for details.',
                severity: 'error',
            },
        ],
    },

    // =========================================================================
    // 25-28. Infrastructure (not individual artifacts, but shared concerns)
    // =========================================================================
    // Infrastructure files (html-factory, report-styles, report-sections, etc.)
    // are not individual artifacts but shared concerns. They are covered by
    // the R5 phase (CSS audit) and R6 phase (documentation).
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
