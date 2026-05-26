import { ask, askConfirm, info, printError, title } from './prompt';
import { rootLogger } from './logger';
import { classifyFailure } from './failure-analysis';
import Config from './config';
import type { BugReport, LLMEnrichment, TestResult } from './types';
import type { ParseResult } from './result_parser';
import type JiraResource from '../jira_management/jira_resource';

function buildSummaryFromFailures(result: ParseResult): string {
    const failed = result.stats?.failed ?? 0;
    const total = result.stats?.total ?? 0;
    return `${failed}/${total} testes falharam`;
}

function buildDescriptionFromFailures(result: ParseResult): string {
    const lines: string[] = [];
    for (const t of result.tests || []) {
        if (t.state === 'failed') {
            lines.push(`*${t.title}*`);
            if (t.error) lines.push(`  Erro: ${t.error.slice(0, 500)}`);
            lines.push('');
        }
    }
    return lines.join('\n') || 'Nenhum detalhe disponível.';
}

async function enrichWithLlm(summary: string, description: string): Promise<LLMEnrichment | undefined> {
    try {
        const classification = await classifyFailure(summary, description.slice(0, 1000));
        return {
            enrichedAt: new Date().toISOString(),
            model: 'fast',
            rootCause: classification,
            confidence: 0.5,
        };
    } catch (err) {
        rootLogger.warn('LLM enrichment failed: ' + (err as Error).message);
        return undefined;
    }
}

export async function collectManual(): Promise<BugReport> {
    title('Bug Report Manual');

    const summary = await ask('Sumário do bug');
    if (!summary.trim()) throw new Error('Sumário obrigatório para criar bug report.');

    const description = await ask('Descrição detalhada');
    const stepsToReproduceRaw = await ask('Passos para reproduzir (separados por vírgula)');
    const expectedResult = await ask('Resultado esperado');
    const actualResult = await ask('Resultado atual');
    const environment = await ask('Ambiente (ex: produção, staging)');
    const severityRaw = await ask('Severidade (trivial | minor | major | critical)', { default: 'minor' });
    const component = await ask('Componente (opcional)');

    const severity = (['trivial', 'minor', 'major', 'critical'] as const).includes(
        severityRaw.trim().toLowerCase() as BugReport['severity'],
    )
        ? (severityRaw.trim().toLowerCase() as BugReport['severity'])
        : 'minor';

    const stepsToReproduce = stepsToReproduceRaw.trim()
        ? stepsToReproduceRaw.split(',').map((s) => s.trim())
        : undefined;

    let llmEnrichment: LLMEnrichment | undefined;
    if (await askConfirm('Usar IA para classificar o bug?', true)) {
        llmEnrichment = await enrichWithLlm(summary, description);
        if (llmEnrichment) {
            info('Classificação sugerida pela IA: ' + (llmEnrichment.rootCause || 'não disponível'));
        }
    }

    return {
        summary: summary.trim(),
        description: description.trim(),
        source: 'manual',
        stepsToReproduce,
        expectedResult: expectedResult.trim() || undefined,
        actualResult: actualResult.trim() || undefined,
        environment: environment.trim() || undefined,
        severity,
        component: component.trim() || undefined,
        llmEnrichment,
    };
}

export function collectAutomated(
    result: ParseResult,
    pipelineInfo?: {
        pipelineId?: string;
        branch?: string;
        commitSha?: string;
        provider?: string;
    },
): BugReport {
    return {
        summary: buildSummaryFromFailures(result),
        description: buildDescriptionFromFailures(result),
        source: 'automated',
        severity: 'major',
        llmEnrichment: {
            enrichedAt: new Date().toISOString(),
            model: 'analysis',
            confidence: 0.5,
        },
        metadata: pipelineInfo,
    };
}

export function compose(report: BugReport): string {
    const lines = [
        `*Bug Report — ${report.source === 'automated' ? 'Automático' : 'Manual'}*`,
        '',
        `**Sumário:** ${report.summary}`,
        `**Severidade:** ${report.severity}`,
        '',
    ];

    if (report.description) lines.push(`**Descrição:**\n${report.description}\n`);
    if (report.stepsToReproduce?.length) {
        lines.push('**Passos para reproduzir:**');
        report.stepsToReproduce.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
        lines.push('');
    }
    if (report.expectedResult) lines.push(`**Resultado esperado:** ${report.expectedResult}\n`);
    if (report.actualResult) lines.push(`**Resultado atual:** ${report.actualResult}\n`);
    if (report.environment) lines.push(`**Ambiente:** ${report.environment}\n`);
    if (report.component) lines.push(`**Componente:** ${report.component}\n`);

    if (report.llmEnrichment?.rootCause) {
        lines.push(`**Análise IA:** ${report.llmEnrichment.rootCause}`);
    }
    if (report.metadata?.pipelineId) {
        lines.push(`**Pipeline:** ${report.metadata.pipelineId}`);
        if (report.metadata.branch) lines.push(`**Branch:** ${report.metadata.branch}`);
        if (report.metadata.commitSha) lines.push(`**Commit:** ${report.metadata.commitSha}`);
    }

    lines.push('', '---', `Gerado por QA Tools em ${new Date().toISOString()}`);
    return lines.join('\n');
}

export async function fileToJira(jiraResource: JiraResource, report: BugReport, projectKey?: string): Promise<string> {
    const key = projectKey || Config.jiraProject;
    if (!key) throw new Error('Project key is required — set JIRA_PROJECT env var or provide projectKey param.');

    const fields: Record<string, unknown> = {
        project: { key },
        summary: report.summary,
        description: compose(report),
        issuetype: { name: 'Bug' },
        labels: ['bug-report', report.source],
    };

    if (report.severity === 'critical') fields.priority = { name: 'Highest' };
    else if (report.severity === 'major') fields.priority = { name: 'High' };
    if (report.component) fields.components = [{ name: report.component }];

    const result = await jiraResource.postJiraResource('issue', { fields });
    return result.key as string;
}

export async function interactiveBugReportFlow(
    jiraResource: JiraResource,
    projectKey: string,
    preFilled?: BugReport,
): Promise<TestResult | null> {
    const report = preFilled || (await collectManual());

    info('');
    info('=== Pré-visualização do Bug Report ===');
    info(compose(report));
    info('');

    if (!(await askConfirm('Criar bug no Jira?', true))) {
        info('Bug report cancelado.');
        return null;
    }

    try {
        const key = await fileToJira(jiraResource, report, projectKey);
        info(`Bug criado: ${key}`);
        return { status: 'ok', label: key, message: report.summary };
    } catch (err) {
        printError('Falha ao criar bug no Jira', err);
        return { status: 'error', label: '', message: (err as Error).message };
    }
}
