/** Parsing and resolution — dry-run handler, CSV/JSON path resolution, label parsing, JSON test parsing. */
import * as fs from 'fs';
import * as path from 'path';
import Config from '../shared/config';
import { rootLogger } from '../shared/logger';
import { load as loadState } from '../shared/state';
import { isPreconditionKey } from '../shared/quoted-string';
import { ImportJsonSchema } from './csv-import-schema';
import { warn, prompt, printSummary, askFilePath } from '../shared/prompt';
import type { TestCase } from '../shared/types';

const csvDefaultPath = Config.get('csvDefaultPath') || path.join(__dirname, 'test_steps.csv');

export function handleDryRun(
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

export async function resolveCsvPath(csvPathInput: string | undefined): Promise<string> {
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

export function resolveLabels(jiraLabelsInput: string[] | undefined, configKey: 'csvLabels' | 'jsonLabels'): string[] {
    if (jiraLabelsInput) return jiraLabelsInput;
    const state = loadState();
    const configValue = Config.get(configKey === 'csvLabels' ? 'csvLabels' : 'jsonLabels');
    const labels =
        configValue ||
        prompt('Labels Jira (separadas por virgula)', {
            hint: state.lastLabels ? 'último: ' + (state.lastLabels as string) : 'vazio para nenhuma',
            default: (state.lastLabels as string) || '',
        });
    return labels
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

export async function resolveJsonPath(jsonPathInput: string | undefined): Promise<string | undefined> {
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

export function parseJsonTests(jsonPath: string): TestCase[] {
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
