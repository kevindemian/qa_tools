/** CSV/JSON import preparation — validate inputs, check Jira project/existing tests, and create task IDs. */
import * as fs from 'fs';
import * as path from 'path';
import { md, mdToHtml } from '../shared/markdown';
import Config from '../shared/config';
import type { JsonObject, TestCase } from '../shared/types';
import { isPreconditionKey } from '../shared/quoted-string';
import { TestCaseSchema, ImportJsonSchema } from './csv-import-schema';
import { rootLogger } from '../shared/logger';
import { load as loadState } from '../shared/state';
import { OPERATION_CANCELLED } from './constants';
import { confirm, info, warn, print, title, divider, prompt, error, printSummary, askFilePath } from '../shared/prompt';
import { writeEphemeral } from '../shared/temp-dir';
import { openWithOsOrFallback } from '../shared/open';

const csvDefaultPath = Config.get('csvDefaultPath') || path.join(__dirname, 'test_steps.csv');
const CHECKPOINT_MAX_AGE_MS = 86400000;
const MAX_WARNINGS_TO_SHOW = 5;

/** Options for {@link generatePreviewMarkdown}. */
export interface PreviewMdOptions {
    keys?: string[];
    documentTitle?: string;
    showTimestamp?: boolean;
    labels?: string[];
    totalSteps?: number;
    groupsCount?: number;
}

function _checkResumeCheckpoint(
    tests: TestCase[],
    sourcePath: string,
    sourceType: string,
    projectName: string,
): { resumeFrom: number; inMemoryTasksId: string[]; inMemoryTasksText: string[] } {
    const cp = loadState()._checkpoint as JsonObject | undefined;
    const cpKey = sourceType === 'json' ? 'jsonPath' : 'csvPath';
    let resumeFrom = 0;
    const inMemoryTasksId: string[] = [];
    const inMemoryTasksText: string[] = [];

    if (
        cp &&
        cp[cpKey] === sourcePath &&
        cp.project === projectName &&
        cp.testCount === tests.length &&
        Array.isArray(cp.done)
    ) {
        const age = Date.now() - new Date((cp.ts as string) ?? '').getTime();
        if (age < CHECKPOINT_MAX_AGE_MS && (cp.done as Array<unknown>).length < tests.length) {
            const ans = confirm(
                (cp.done as Array<unknown>).length + '/' + tests.length + ' testes ja criados. Continuar?',
                true,
            );
            if (ans) {
                resumeFrom = (cp.done as Array<{ key: string; title: string }>).length;
                for (const d of cp.done as Array<{ key: string; title: string }>) {
                    inMemoryTasksId.push(d.key);
                    inMemoryTasksText.push(d.title);
                }
                info('Retomando do teste ' + (resumeFrom + 1) + '...');
            }
        }
    }

    return { resumeFrom, inMemoryTasksId, inMemoryTasksText };
}

/** Generate canonical Markdown from test cases. Serves as the single source of truth for:
 * - Terminal fallback preview (`print(md(...))`)
 * - HTML browser preview (`mdToHtml(...)` → `openWithOsOrFallback`)
 * - Saved `.md` file (preview + post-creation mapping)
 *
 * Steps are rendered in Gira-like format (bullet per field) for readability. */
function _renderTestHeader(t: TestCase, index: number, keys?: string[]): string {
    const headingLabel = keys ? keys[index] || 'Test ' + (index + 1) : 'Test ' + (index + 1);
    let out = '## ' + headingLabel + ' — ' + t.title + '\n';
    out += t.description ? '**Description:** ' + t.description + '\n\n' : '**Description:** —\n\n';
    return out;
}

function _renderTestMeta(t: TestCase): string {
    const parts: string[] = [];
    if (t.precondition) parts.push('**Pre-cond:** ' + t.precondition.value);
    if (t.group) parts.push('**Group:** ' + t.group);
    if (t.linkedIssues && t.linkedIssues.length > 0) {
        parts.push('**Links:** ' + t.linkedIssues.map((li) => li.key).join(', '));
    }
    return parts.length > 0 ? parts.join(' | ') + '\n\n' : '';
}

function _renderSteps(t: TestCase): string {
    if (!t.steps || t.steps.length === 0) return '_No steps defined._\n\n';
    let out = '### Steps\n\n';
    for (let j = 0; j < t.steps.length; j++) {
        const s = t.steps[j]!;
        out += '**Step ' + (j + 1) + '**\n';
        out += '- **Action:** ' + (s.fields?.Action || '') + '\n';
        if (s.fields?.Data) out += '- **Data:** ' + s.fields.Data + '\n';
        out += '- **Expected Result:** ' + (s.fields?.['Expected Result'] || '') + '\n\n';
    }
    return out;
}

function generatePreviewMarkdown(tests: TestCase[], options?: PreviewMdOptions): string {
    const parts: string[] = [];

    if (options?.documentTitle) parts.push('# ' + options.documentTitle + '\n\n');
    if (options?.showTimestamp) parts.push('*Generated on ' + new Date().toLocaleString('en-US') + '*\n\n');

    const summaryParts: string[] = [];
    if (options?.totalSteps !== undefined || options?.groupsCount !== undefined) {
        const total = options?.totalSteps ?? tests.reduce((s, t) => s + t.steps.length, 0);
        const groups = options?.groupsCount ?? new Set(tests.map((t) => t.group).filter(Boolean)).size;
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
    if (summaryParts.length > 0) parts.push(summaryParts.join('  \n') + '\n\n---\n\n');

    for (let i = 0; i < tests.length; i++) {
        const t = tests[i]!;
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
async function showPreview(
    tests: TestCase[],
    jiraLabels: string[],
    totalSteps: number,
    groupsCount: number,
    openFn: (path: string) => Promise<boolean> = openWithOsOrFallback,
): Promise<void> {
    title('Preview dos testes a serem criados');

    const mdContent = generatePreviewMarkdown(tests, {
        labels: jiraLabels,
        totalSteps,
        groupsCount,
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

function filterTests(tests: TestCase[]): TestCase[] | null {
    if (Config.get('autoConfirm')) return tests;

    const filterText = prompt('Filtrar testes por titulo? (Enter para todos)');
    if (!filterText.trim()) return tests;

    const filtered = tests.filter((t) => t.title.toLowerCase().includes(filterText.trim().toLowerCase()));
    if (filtered.length === 0) {
        warn('Nenhum teste corresponde a "' + filterText.trim() + '".');
        return null;
    }
    info(filtered.length + '/' + tests.length + ' testes correspondem a "' + filterText.trim() + '"');
    if (!confirm('Criar apenas estes ' + filtered.length + ' testes?')) {
        warn(OPERATION_CANCELLED);
        return null;
    }
    return filtered;
}

function confirmOrCancel(): boolean {
    if (Config.get('autoConfirm')) return true;
    return confirm('Criar estes testes no Jira?');
}

interface ValidationResult {
    resumeFrom: number;
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    opLog: ReturnType<typeof rootLogger.child>;
}

function validateImportBatch(
    tests: TestCase[],
    sourcePath: string,
    sourceType: string,
    projectName: string,
): ValidationResult | undefined {
    const { resumeFrom, inMemoryTasksId, inMemoryTasksText } = _checkResumeCheckpoint(
        tests,
        sourcePath,
        sourceType,
        projectName,
    );

    if (resumeFrom === 0) {
        const { errors, warnings } = _runValidationRules(tests);
        _printValidationMessages(errors, warnings);
        if (errors.length > 0) return;
    }

    const opLog = rootLogger.child({ operation: sourceType + '-import', sourcePath });
    return { resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog };
}

function _runValidationRules(tests: TestCase[]): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const titles = new Set<string>();

    tests.forEach((test, i) => {
        const idx = i + 1;
        const result = TestCaseSchema.safeParse(test);
        if (!result.success) {
            result.error.issues.forEach((issue) => {
                const path = issue.path.join('.');
                errors.push('Teste ' + idx + ': ' + path + ' ' + issue.message);
            });
        } else {
            if (test.title && titles.has(test.title)) {
                warnings.push('Teste ' + idx + ': Titulo duplicado "' + test.title + '"');
            }
            if (test.title) titles.add(test.title);

            test.steps.forEach((step, si) => {
                const action = step.fields?.Action || '';
                if (!action.trim()) {
                    warnings.push('Teste ' + idx + ' "' + test.title + '": Step ' + (si + 1) + ' sem Action');
                }
            });
        }
    });

    return { errors, warnings };
}

function _printValidationMessages(errors: string[], warnings: string[]): void {
    if (warnings.length > 0) {
        warn('Avisos (' + warnings.length + '):');
        warnings.slice(0, MAX_WARNINGS_TO_SHOW).forEach((w) => warn('  ' + w));
        if (warnings.length > MAX_WARNINGS_TO_SHOW)
            warn('  ... e mais ' + (warnings.length - MAX_WARNINGS_TO_SHOW) + ' aviso(s)');
    }
    if (errors.length > 0) {
        error('Erros (' + errors.length + '):');
        errors.forEach((e) => error('  ' + e));
        warn('Corrija os dados antes de importar.');
    }
}

function handleDryRun(
    tests: TestCase[],
    onBusy: (busy: boolean) => void,
    sourcePath: string,
): {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    summary: string;
    status: string;
    sourcePath: string;
} | null {
    if (!Config.get('dryRun')) return null;

    warn('MODO DRY-RUN: Nenhuma operação sera executada.');
    printSummary(tests.map((t) => ({ status: 'ok' as const, label: t.title, message: 'simulado' })));
    onBusy(false);
    return {
        inMemoryTasksId: [],
        inMemoryTasksText: [],
        summary: 'DRY-RUN: ' + tests.length + ' testes simulados',
        status: 'ok',
        sourcePath,
    };
}

async function resolveCsvPath(csvPathInput: string | undefined): Promise<string> {
    const state = loadState();
    return (
        csvPathInput ||
        Config.get('csvPath') ||
        (await askFilePath('Caminho do arquivo CSV', {
            extensions: ['.csv'],
            default: (state.lastCsvPath as string) || csvDefaultPath,
        }))
    );
}

function resolveLabels(jiraLabelsInput: string[] | undefined, configKey: 'csvLabels' | 'jsonLabels'): string[] {
    if (jiraLabelsInput) return jiraLabelsInput;
    const state = loadState();
    const configValue = Config.get(configKey === 'csvLabels' ? 'csvLabels' : 'jsonLabels');
    const labels =
        configValue ||
        prompt('Labels Jira (separadas por virgula)', {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            hint: state.lastLabels ? 'último: ' + String(state.lastLabels) : 'vazio para nenhuma',
            default: (state.lastLabels as string) || '',
        });
    return labels
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

async function resolveJsonPath(jsonPathInput: string | undefined): Promise<string | undefined> {
    const state = loadState();
    const rawPath =
        jsonPathInput ||
        Config.get('jsonPath') ||
        (await askFilePath('Caminho do arquivo JSON ou TXT (formato JSON)', {
            extensions: ['.json', '.txt'],
            default: (state.lastJsonPath as string) || '',
        }));

    let jsonPath = rawPath.trim();
    if (!jsonPath) {
        warn('Caminho do JSON vazio. Operação cancelada.');
        return;
    }
    if (state.lastJsonDir && !path.isAbsolute(jsonPath)) {
        const potential = path.resolve(state.lastJsonDir as string, jsonPath);
        if (fs.existsSync(potential)) {
            jsonPath = potential;
        }
    }
    return jsonPath;
}

function parseJsonTests(jsonPath: string): TestCase[] {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const validated = ImportJsonSchema.parse(parsed);
    let aliasWarned = false;
    return validated.map((item) => ({
        title: item.title,
        description: item.description || '',
        steps: item.steps.map((s) => {
            const expectedResult = s['Expected Result'] ?? s['ExpectedResult'] ?? '';
            if (!aliasWarned && s['ExpectedResult'] && !s['Expected Result']) {
                aliasWarned = true;
                rootLogger.warn(
                    'JSON step usa "ExpectedResult" (junto, sem espaço) em vez de "Expected Result" (com espaço). ' +
                        'Causa: template JSON desatualizado (test_cases_template.json / test_steps_template.json). ' +
                        'Solução: renomeie a chave para "Expected Result" nos seus arquivos JSON. ' +
                        'Este aviso aparece apenas uma vez por arquivo.',
                );
            }
            return {
                fields: {
                    Action: s.Action || '',
                    Data: s.Data || '',
                    'Expected Result': expectedResult,
                },
            };
        }),
        precondition: item.precondition
            ? isPreconditionKey(item.precondition)
                ? { type: 'reference' as const, value: item.precondition }
                : { type: 'inline' as const, value: item.precondition }
            : undefined,
        group: item.group || '',
        linkedIssues: Array.isArray(item.linkedIssues)
            ? item.linkedIssues.map((li) => {
                  if (typeof li === 'string') return { key: li, linkType: 'Tests' };
                  return { key: li.key, linkType: li.linkType || 'Tests' };
              })
            : [],
    }));
}

export {
    _checkResumeCheckpoint,
    showPreview,
    filterTests,
    confirmOrCancel,
    validateImportBatch,
    handleDryRun,
    resolveCsvPath,
    resolveLabels,
    resolveJsonPath,
    parseJsonTests,
    generatePreviewMarkdown,
};
