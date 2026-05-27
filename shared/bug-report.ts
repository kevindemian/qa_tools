import { ask, askConfirm, info, printError, title, warn } from './prompt';
import { rootLogger } from './logger';
import { classifyFailure } from './failure-analysis';
import Config from './config';
import type { BugReport, LLMEnrichment, TestResult } from './types';
import type { ParseResult } from './result_parser';
import type JiraResource from '../jira_management/jira_resource';
import type JiraLinkManager from '../jira_management/jira_link_manager';

const ERROR_TRUNCATION_LIMIT = 500;
const LLM_DESC_TRUNCATION_LIMIT = 1000;
const LLM_CONFIDENCE = 0.5;

function buildSummaryFromFailures(result: ParseResult): string {
    const failed = result.stats?.failed ?? 0;
    const total = result.stats?.total ?? 0;
    return `${failed}/${total} tests failed`;
}

function buildDescriptionFromFailures(result: ParseResult): string {
    const lines: string[] = [];
    for (const t of result.tests || []) {
        if (t.state === 'failed') {
            lines.push(`*${t.title}*`);
            if (t.error) lines.push(`  Error: ${t.error.slice(0, ERROR_TRUNCATION_LIMIT)}`);
            lines.push('');
        }
    }
    return lines.join('\n') || 'No details available.';
}

async function enrichWithLlm(summary: string, description: string): Promise<LLMEnrichment | undefined> {
    try {
        const classification = await classifyFailure(summary, description.slice(0, LLM_DESC_TRUNCATION_LIMIT));
        return {
            enrichedAt: new Date().toISOString(),
            model: 'fast',
            rootCause: classification,
            confidence: LLM_CONFIDENCE,
        };
    } catch (err) {
        rootLogger.warn('LLM enrichment failed: ' + (err as Error).message);
        return undefined;
    }
}

export async function collectManual(): Promise<BugReport> {
    title('Bug Report Manual');

    let summary = '';
    for (let attempt = 0; attempt < 3; attempt++) {
        summary = await ask('Sumário do bug');
        if (summary.trim()) break;
        warn('Sumário não pode estar vazio. Tente novamente.');
    }
    if (!summary.trim()) throw new Error('Sumário obrigatório para criar bug report.');

    const description = await ask('Descrição detalhada');
    const stepsToReproduceRaw = await ask('Passos para reproduzir (separados por vírgula)');
    const expectedResult = await ask('Resultado esperado');
    const actualResult = await ask('Resultado atual');
    const environment = await ask('Ambiente (ex: produção, staging)');
    const severityRaw = await ask('Severidade (trivial | minor | major | critical)', { default: 'minor' });
    const component = await ask('Componente (opcional)');
    const linkedIssuesInput = await ask('Issues relacionadas (KEY-123, KEY-456) — opcional');
    const linkedIssues = linkedIssuesInput.trim()
        ? linkedIssuesInput.split(',').map((k) => ({ key: k.trim().toUpperCase(), linkType: 'Relates' }))
        : undefined;

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
        linkedIssues,
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
            confidence: LLM_CONFIDENCE,
        },
        metadata: pipelineInfo,
    };
}

export function compose(report: BugReport): string {
    const lines = [
        `*Bug Report — ${report.source === 'automated' ? 'Automated' : 'Manual'}*`,
        '',
        `**Summary:** ${report.summary}`,
        `**Severity:** ${report.severity}`,
        '',
    ];

    if (report.description) lines.push(`**Description:**\n${report.description}\n`);
    if (report.stepsToReproduce?.length) {
        lines.push('**Steps to Reproduce:**');
        report.stepsToReproduce.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
        lines.push('');
    }
    if (report.expectedResult) lines.push(`**Expected Result:** ${report.expectedResult}\n`);
    if (report.actualResult) lines.push(`**Actual Result:** ${report.actualResult}\n`);
    if (report.environment) lines.push(`**Environment:** ${report.environment}\n`);
    if (report.component) lines.push(`**Component:** ${report.component}\n`);
    if (report.linkedIssues?.length) {
        lines.push(`**Linked Issues:** ${report.linkedIssues.map((li) => li.key).join(', ')}\n`);
    }

    if (report.llmEnrichment?.rootCause) {
        lines.push(`**AI Analysis:** ${report.llmEnrichment.rootCause}`);
    }
    if (report.metadata?.pipelineId) {
        lines.push(`**Pipeline:** ${report.metadata.pipelineId}`);
        if (report.metadata.branch) lines.push(`**Branch:** ${report.metadata.branch}`);
        if (report.metadata.commitSha) lines.push(`**Commit:** ${report.metadata.commitSha}`);
    }

    lines.push('', '---', `Generated by QA Tools at ${new Date().toISOString()}`);
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
    linkManager?: JiraLinkManager,
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

        if (report.linkedIssues && report.linkedIssues.length > 0 && linkManager) {
            await linkManager.linkIssues(key, report.linkedIssues);
            info(`${report.linkedIssues.length} linked issue(s) vinculados`);
        }

        return { status: 'ok', label: key, message: report.summary };
    } catch (err) {
        printError('Falha ao criar bug no Jira', err);
        return { status: 'error', label: '', message: (err as Error).message };
    }
}
