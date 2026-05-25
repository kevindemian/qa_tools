import * as fs from 'fs';
import * as path from 'path';
import Config from '../shared/config';
import type { TestCase } from '../shared/types';
import { isPreconditionKey } from '../shared/quoted-string';
import TestCaseValidator from './test-case-validator';
import { rootLogger } from '../shared/logger';
import { load as loadState } from '../shared/state';
import { OPERATION_CANCELLED } from './constants';
import { confirm, info, warn, print, title, divider, prompt, error, printSummary, ask } from '../shared/prompt';

const csvDefaultPath = Config.csvDefaultPath || path.join(__dirname, 'test_steps.csv');

function _checkResumeCheckpoint(
    tests: TestCase[],
    sourcePath: string,
    sourceType: string,
    projectName: string,
): { resumeFrom: number; inMemoryTasksId: string[]; inMemoryTasksText: string[] } {
    const cp = loadState()._checkpoint as Record<string, unknown> | undefined;
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
        if (age < 86400000 && (cp.done as Array<unknown>).length < tests.length) {
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

function showPreview(tests: TestCase[], jiraLabels: string[], totalSteps: number, groupsCount: number): void {
    title('Preview dos testes a serem criados');
    tests.forEach((test, i) => {
        const desc = test.description ? ' — ' + test.description.substring(0, 60) : '';
        const pre = test.precondition ? ' [pre: ' + test.precondition.value.substring(0, 30) + ']' : '';
        const links = test.linkedIssues?.length ? ' [' + test.linkedIssues.length + ' link(s)]' : '';
        const group = test.group ? ' [grupo: ' + test.group + ']' : '';
        const stepsInfo = test.steps.length + ' step(s)';
        const firstStep = test.steps[0]?.fields?.Action?.substring(0, 30) || '';
        const lastStep =
            test.steps.length > 1 ? test.steps[test.steps.length - 1]?.fields?.Action?.substring(0, 30) || '' : '';
        const stepPreview =
            ' [' +
            stepsInfo +
            ': "' +
            firstStep +
            '"...' +
            (lastStep && lastStep !== firstStep ? ' "' + lastStep + '"' : '') +
            ']';
        print('  ' + (i + 1) + '. ' + test.title + desc + pre + links + group + stepPreview);
    });
    divider();

    if (jiraLabels.length > 0) {
        info('Labels: ' + jiraLabels.join(', '));
    }
    info(
        'Total: ' +
            tests.length +
            ' teste(s), ' +
            totalSteps +
            ' step(s)' +
            (groupsCount > 0 ? ', ' + groupsCount + ' grupo(s)' : ''),
    );
}

function filterTests(tests: TestCase[]): TestCase[] | null {
    if (Config.autoConfirm) return tests;

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
    if (Config.autoConfirm) return true;
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
        const validator = new TestCaseValidator();
        const { errors, warnings } = validator.validate(tests);
        if (warnings.length > 0) {
            warn('Avisos (' + warnings.length + '):');
            warnings.slice(0, 5).forEach((w) => warn('  ' + w));
            if (warnings.length > 5) warn('  ... e mais ' + (warnings.length - 5) + ' aviso(s)');
        }
        if (errors.length > 0) {
            error('Erros (' + errors.length + '):');
            errors.forEach((e) => error('  ' + e));
            warn('Corrija os dados antes de importar.');
            return;
        }
    }

    const opLog = rootLogger.child({ operation: sourceType + '-import', sourcePath });
    return { resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog };
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
    if (!Config.dryRun) return null;

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
        Config.csvPath ||
        (await ask('Caminho do arquivo CSV', { default: (state.lastCsvPath as string) || csvDefaultPath }))
    );
}

function resolveLabels(jiraLabelsInput: string[] | undefined, configKey: 'csvLabels' | 'jsonLabels'): string[] {
    if (jiraLabelsInput) return jiraLabelsInput;
    const state = loadState();
    const configValue = Config[configKey === 'csvLabels' ? 'csvLabels' : 'jsonLabels'] as string | undefined;
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
        Config.jsonPath ||
        (await ask('Caminho do arquivo JSON ou TXT (formato JSON)', {
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
    if (!Array.isArray(parsed)) throw new Error('JSON deve ser um array de casos de teste');
    return parsed.map((item: Record<string, unknown>, i: number) => {
        if (!item.title || !item.steps || !Array.isArray(item.steps)) {
            throw new Error('Item ' + (i + 1) + ': campos obrigatórios: title (string), steps (array)');
        }
        return {
            title: item.title as string,
            description: (item.description as string) || '',
            steps: (item.steps as Array<Record<string, string>>).map((s) => ({
                fields: {
                    Action: s.Action || '',
                    Data: s.Data || '',
                    ExpectedResult: s.ExpectedResult || '',
                },
            })),
            precondition: item.precondition
                ? isPreconditionKey(item.precondition as string)
                    ? { type: 'reference' as const, value: item.precondition as string }
                    : { type: 'inline' as const, value: item.precondition as string }
                : undefined,
            group: (item.group as string) || '',
            linkedIssues: Array.isArray(item.linkedIssues)
                ? (item.linkedIssues as Array<unknown>).map((li) => {
                      if (typeof li === 'string') return { key: li, linkType: 'Tests' };
                      const liObj = li as { key: string; linkType?: string };
                      return { key: liObj.key, linkType: liObj.linkType || 'Tests' };
                  })
                : [],
        };
    });
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
};
export type { ValidationResult };
