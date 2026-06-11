/** Validation logic for import preparation — checkpoint resume, schema validation, error/warning display. */
import type { JsonObject, TestCase } from '../shared/types.js';
import { TestCaseSchema } from './csv-import-schema.js';
import { rootLogger } from '../shared/logger.js';
import { load as loadState } from '../shared/state.js';
import { confirm, info, warn, error } from '../shared/prompt.js';

const CHECKPOINT_MAX_AGE_MS = 86400000;
const MAX_WARNINGS_TO_SHOW = 5;

export interface ValidationResult {
    resumeFrom: number;
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    opLog: ReturnType<typeof rootLogger.child>;
}

export function _checkResumeCheckpoint(
    tests: TestCase[],
    sourcePath: string,
    sourceType: string,
    projectName: string,
): { resumeFrom: number; inMemoryTasksId: string[]; inMemoryTasksText: string[] } {
    const cp = loadState()['_checkpoint'] as JsonObject | undefined;
    const cpKey = sourceType === 'json' ? 'jsonPath' : 'csvPath';
    let resumeFrom = 0;
    const inMemoryTasksId: string[] = [];
    const inMemoryTasksText: string[] = [];

    if (
        cp &&
        cp[cpKey] === sourcePath &&
        cp['project'] === projectName &&
        cp['testCount'] === tests.length &&
        Array.isArray(cp['done'])
    ) {
        const age = Date.now() - new Date(cp['ts'] as string).getTime();
        if (age < CHECKPOINT_MAX_AGE_MS && (cp['done'] as Array<unknown>).length < tests.length) {
            const ans = confirm(
                (cp['done'] as Array<unknown>).length + '/' + tests.length + ' testes ja criados. Continuar?',
                true,
            );
            if (ans) {
                resumeFrom = (cp['done'] as Array<{ key: string; title: string }>).length;
                for (const d of cp['done'] as Array<{ key: string; title: string }>) {
                    inMemoryTasksId.push(d.key);
                    inMemoryTasksText.push(d.title);
                }
                info('Retomando do teste ' + (resumeFrom + 1) + '...');
            }
        }
    }

    return { resumeFrom, inMemoryTasksId, inMemoryTasksText };
}

export function _runValidationRules(tests: unknown[]): { errors: string[]; warnings: string[] } {
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
            const data = result.data;
            if (data.title && titles.has(data.title)) {
                warnings.push('Teste ' + idx + ': Titulo duplicado "' + data.title + '"');
            }
            if (data.title) titles.add(data.title);

            data.steps.forEach((step, si) => {
                const action = step.fields.Action || '';
                if (!action.trim()) {
                    warnings.push('Teste ' + idx + ' "' + data.title + '": Step ' + (si + 1) + ' sem Action');
                }
            });
        }
    });

    return { errors, warnings };
}

export function _printValidationMessages(errors: string[], warnings: string[]): void {
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

export function validateImportBatch(
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
