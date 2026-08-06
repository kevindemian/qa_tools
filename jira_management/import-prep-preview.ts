/** Preview rendering — Markdown generation, terminal/HTML preview, confirmation. */
import Config from '../shared/config-accessor.js';
import { md, mdToHtml } from '../shared/report/markdown.js';
import { writeEphemeral } from '../shared/infra/temp-dir.js';
import { openWithOsOrFallback } from '../shared/open.js';
import { confirm, info, print, title, divider } from '../shared/ui/prompt.js';
import type { TestCase, BatchFields, TestExecutionDeclaration } from '../shared/types.js';

/** Options for {@link generatePreviewMarkdown}. */
export interface PreviewMdOptions {
    keys?: string[];
    documentTitle?: string;
    showTimestamp?: boolean;
    labels?: string[];
    totalSteps?: number;
    groupsCount?: number;
    batchFields?: BatchFields;
    testExecution?: TestExecutionDeclaration;
}

function _renderTestHeader(t: TestCase, index: number, keys?: string[]): string {
    const headingLabel = keys ? Reflect.get(keys, index) || 'Test ' + (index + 1) : 'Test ' + (index + 1);
    let out = '## ' + headingLabel + ' — ' + t.title + '\n';
    out += t.description ? '**Description:** ' + t.description + '\n\n' : '**Description:** —\n\n';
    return out;
}

function _renderTestMeta(t: TestCase): string {
    const parts: string[] = [];
    if (t.precondition && t.precondition.length > 0) {
        parts.push('**Pre-cond:** ' + t.precondition.map((p) => p.value).join(', '));
    }
    if (t.group) parts.push('**Group:** ' + t.group);
    if (t.linkedIssues && t.linkedIssues.length > 0) {
        parts.push('**Links:** ' + t.linkedIssues.map((li) => li.key).join(', '));
    }
    return parts.length > 0 ? parts.join(' | ') + '\n\n' : '';
}

function _renderSteps(t: TestCase): string {
    if (t.steps.length === 0) return '_No steps defined._\n\n';
    let out = '### Steps\n\n';
    for (let j = 0; j < t.steps.length; j++) {
        const s = Reflect.get(t.steps, j) as NonNullable<NonNullable<(typeof t)['steps']>[number]> | undefined;
        if (!s) continue;
        out += '**Step ' + (j + 1) + '**\n';
        out += '- **Action:** ' + (s.fields.Action || '') + '\n';
        if (s.fields.Data) out += '- **Data:** ' + s.fields.Data + '\n';
        out += '- **Expected Result:** ' + (s.fields['Expected Result'] || '') + '\n\n';
    }
    return out;
}

export function generatePreviewMarkdown(tests: TestCase[], options?: PreviewMdOptions): string {
    const parts: string[] = [];

    if (options?.documentTitle) parts.push('# ' + options.documentTitle + '\n\n');
    if (options?.showTimestamp) parts.push('*Generated on ' + new Date().toLocaleString('en-US') + '*\n\n');

    const summaryParts: string[] = [];
    if (options?.totalSteps !== undefined || options?.groupsCount !== undefined) {
        const total = options.totalSteps ?? tests.reduce((s, t) => s + t.steps.length, 0);
        const groups = options.groupsCount ?? new Set(tests.map((t) => t.group).filter(Boolean)).size;
        summaryParts.push(
            tests.length + ' teste(s), ' + total + ' step(s)' + (groups > 0 ? ', ' + groups + ' grupo(s)' : ''),
        );
    }
    if (options?.labels && options.labels.length > 0) {
        const MAX = 3;
        const text =
            options.labels.length <= MAX
                ? options.labels.join(', ')
                : options.labels.slice(0, MAX).join(', ') + ' +' + (options.labels.length - MAX);
        summaryParts.push('**Labels:** ' + text);
    }
    if (options?.batchFields) {
        if (options.batchFields.environment) summaryParts.push('**Environment:** ' + options.batchFields.environment);
        if (options.batchFields.components && options.batchFields.components.length > 0) {
            summaryParts.push('**Components:** ' + options.batchFields.components.join(', '));
        }
        if (options.batchFields.priority) summaryParts.push('**Priority:** ' + options.batchFields.priority);
    }
    if (options?.testExecution) {
        const teTitle = options.testExecution.title || '(titulo do arquivo)';
        summaryParts.push('**Test Execution:** ' + teTitle);
        if (options.testExecution.description) summaryParts.push('  Descrição: ' + options.testExecution.description);
        if (options.testExecution.labels && options.testExecution.labels.length > 0) {
            summaryParts.push('  Labels TE: ' + options.testExecution.labels.join(', '));
        }
    }
    if (summaryParts.length > 0) parts.push(summaryParts.join('  \n') + '\n\n---\n\n');

    for (let i = 0; i < tests.length; i++) {
        const t = Reflect.get(tests, i) as NonNullable<(typeof tests)[number]> | undefined;
        if (!t) continue;
        parts.push(_renderTestHeader(t, i, options?.keys));
        parts.push(_renderTestMeta(t));
        parts.push(_renderSteps(t));
        if (i < tests.length - 1) parts.push('---\n\n');
    }
    return parts.join('');
}

/** Show preview of tests before creation. Browser-first, terminal fallback.
 * Generates canonical MD, converts to HTML via `mdToHtml()`, and opens in system browser.
 * If browser unavailable, prints MD to terminal as fallback.
 *
 * @param openFn  Override for the browser-open function (injected for testability). */
export async function showPreview(
    tests: TestCase[],
    jiraLabels: string[],
    totalSteps: number,
    groupsCount: number,
    openFn: (path: string) => Promise<boolean> = openWithOsOrFallback,
    batchFields?: BatchFields,
    testExecution?: TestExecutionDeclaration,
): Promise<void> {
    title('Preview dos testes a serem criados');

    const mdContent = generatePreviewMarkdown(tests, {
        labels: jiraLabels,
        totalSteps,
        groupsCount,
        ...(batchFields ? { batchFields } : {}),
        ...(testExecution ? { testExecution } : {}),
    });

    const mdPath = writeEphemeral('previews', 'qa-preview.md', mdContent);
    const htmlContent = mdToHtml(mdContent, 'Preview — QA Tools');
    const htmlPath = writeEphemeral('previews', 'qa-preview.html', htmlContent);

    const opened = await openFn(htmlPath);
    if (opened) {
        info('Preview aberto no navegador');
        info('Preview salvo: ' + mdPath);
    } else {
        divider();
        print(md(mdContent));
        divider();
        info('Nao foi possivel abrir o navegador. Preview salvo em: ' + mdPath);
        info('HTML alternativo: ' + htmlPath);
    }
}

export function confirmOrCancel(): boolean {
    if (Config.get('autoConfirm')) return true;
    if (!process.stdin.isTTY) {
        throw new Error(
            'Confirmacao interativa requerida em ambiente nao-interativo. ' +
                'Use --auto para confirmar automaticamente.',
        );
    }
    return confirm('Criar estes testes no Jira?');
}
