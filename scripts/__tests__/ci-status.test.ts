import { describe, it, expect, vi } from 'vitest';
import {
    parseArgs,
    classifyOutcome,
    buildReport,
    formatRunLine,
    formatJobLine,
    emitReport,
    runCiStatus,
} from '../ci-status.js';
import type { WorkflowRun, Job, Report, CiHttpClient } from '../ci-status.js';

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
    return {
        id: 1,
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        head_branch: 'dev',
        html_url: 'https://github.com/x/y/actions/runs/1',
        ...overrides,
    };
}

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        id: 10,
        name: 'Test',
        status: 'completed',
        conclusion: 'success',
        html_url: 'https://github.com/x/y/actions/jobs/10',
        ...overrides,
    };
}

describe('Ci-status parseArgs', () => {
    it('usa defaults quando nenhum argumento e passado', () => {
        expect(parseArgs([])).toStrictEqual({ branch: 'dev', logs: false });
    });

    it('lê --branch com valor', () => {
        expect(parseArgs(['--branch', 'main'])).toStrictEqual({ branch: 'main', logs: false });
    });

    it('ativa logs com --logs', () => {
        expect(parseArgs(['--logs'])).toStrictEqual({ branch: 'dev', logs: true });
    });

    it('combina --branch e --logs em qualquer ordem', () => {
        expect(parseArgs(['--logs', '--branch', 'release'])).toStrictEqual({ branch: 'release', logs: true });
        expect(parseArgs(['--branch', 'release', '--logs'])).toStrictEqual({ branch: 'release', logs: true });
    });

    it('lança erro quando --branch nao tem valor', () => {
        expect(() => parseArgs(['--branch'])).toThrow('--branch requer um valor');
    });

    it('ignora argumentos desconhecidos sem alterar defaults', () => {
        expect(parseArgs(['--unknown', 'x'])).toStrictEqual({ branch: 'dev', logs: false });
    });
});

describe('Ci-status classifyOutcome', () => {
    it('retorna no-runs quando nao ha runs', () => {
        expect(classifyOutcome([], [])).toStrictEqual({ kind: 'no-runs' });
    });

    it('retorna in-progress quando o run mais recente nao esta completo', () => {
        const run = makeRun({ status: 'in_progress', conclusion: null });

        expect(classifyOutcome([run], [])).toStrictEqual({ kind: 'in-progress', run });
    });

    it('retorna success quando o run concluiu com sucesso', () => {
        const run = makeRun({ conclusion: 'success' });

        expect(classifyOutcome([run], [makeJob()])).toStrictEqual({ kind: 'success', run });
    });

    it('retorna failed com apenas os jobs que falharam', () => {
        const run = makeRun({ conclusion: 'failure' });
        const ok = makeJob({ id: 1, name: 'Quality', conclusion: 'success' });
        const bad = makeJob({ id: 2, name: 'Semgrep', conclusion: 'failure' });
        const result = classifyOutcome([run], [ok, bad]);

        expect(result).toStrictEqual({ kind: 'failed', run, failedJobs: [bad] });
    });

    it('retorna concluded-no-failure quando run falhou mas nenhum job marca failure', () => {
        const run = makeRun({ conclusion: 'cancelled' });
        const cancelled = makeJob({ conclusion: 'cancelled' });

        expect(classifyOutcome([run], [cancelled])).toStrictEqual({ kind: 'concluded-no-failure', run });
    });

    it('classifica sobre o run mais recente (primeiro do array)', () => {
        const latest = makeRun({ id: 99, conclusion: 'success' });
        const older = makeRun({ id: 1, conclusion: 'failure' });

        expect(classifyOutcome([latest, older], [])).toStrictEqual({ kind: 'success', run: latest });
    });
});

describe('Ci-status formatters', () => {
    it('formatRunLine inclui id, name, status, conclusion e url', () => {
        const line = formatRunLine(makeRun({ id: 42, name: 'CI', status: 'completed', conclusion: 'success' }));

        expect(line).toBe(
            '[ci-status] run #42 "CI" | status=completed conclusion=success | https://github.com/x/y/actions/runs/1',
        );
    });

    it('formatRunLine renderiza conclusion nula como "?"', () => {
        expect(formatRunLine(makeRun({ conclusion: null }))).toContain('conclusion=?');
    });

    it('formatJobLine inclui name e conclusion', () => {
        expect(formatJobLine(makeJob({ name: 'Semgrep', conclusion: 'failure' }))).toBe(
            '  Semgrep | conclusion=failure',
        );
    });

    it('formatJobLine renderiza conclusion nula como "?"', () => {
        expect(formatJobLine(makeJob({ conclusion: null }))).toBe('  Test | conclusion=?');
    });
});

describe('Ci-status buildReport', () => {
    it('no-runs: sem linhas, exit 0, sem logs', () => {
        expect(buildReport({ kind: 'no-runs' }, false)).toStrictEqual({
            lines: [],
            exitCode: 0,
            fetchLogsFor: [],
        });
    });

    it('in-progress: exit 0 e mensagem de andamento', () => {
        const run = makeRun({ status: 'in_progress', conclusion: null });
        const report = buildReport({ kind: 'in-progress', run }, false);

        expect(report.exitCode).toBe(0);
        expect(report.fetchLogsFor).toStrictEqual([]);
        expect(report.lines.map((l) => l.text)).toContain('[ci-status] run ainda em andamento.');
    });

    it('success: exit 0 e "CI verde."', () => {
        const run = makeRun({ conclusion: 'success' });
        const report = buildReport({ kind: 'success', run }, false);

        expect(report.exitCode).toBe(0);
        expect(report.lines[report.lines.length - 1]).toStrictEqual({
            level: 'info',
            text: '[ci-status] CI verde.',
        });
    });

    it('concluded-no-failure: exit 1 e linha de erro', () => {
        const run = makeRun({ conclusion: 'cancelled' });
        const report = buildReport({ kind: 'concluded-no-failure', run }, false);

        expect(report.exitCode).toBe(1);
        expect(report.lines.some((l) => l.level === 'error' && l.text.includes('cancelled'))).toBeTruthy();
        expect(report.fetchLogsFor).toStrictEqual([]);
    });

    it('failed sem --logs: exit 1, uma linha de erro por job falho, dica de --logs, sem fetch', () => {
        const run = makeRun({ conclusion: 'failure' });
        const bad1 = makeJob({ id: 2, name: 'Semgrep', conclusion: 'failure' });
        const bad2 = makeJob({ id: 3, name: 'Types', conclusion: 'failure' });
        const report = buildReport({ kind: 'failed', run, failedJobs: [bad1, bad2] }, false);

        expect(report.exitCode).toBe(1);
        expect(report.fetchLogsFor).toStrictEqual([]);

        const errorTexts = report.lines.filter((l) => l.level === 'error').map((l) => l.text);

        expect(errorTexts).toContain('[ci-status] FALHOU: Semgrep — https://github.com/x/y/actions/jobs/10');
        expect(errorTexts).toContain('[ci-status] FALHOU: Types — https://github.com/x/y/actions/jobs/10');
        expect(report.lines.some((l) => l.text.includes('use --logs'))).toBeTruthy();
    });

    it('failed com --logs: fetchLogsFor contem exatamente os jobs falhos e sem dica de --logs', () => {
        const run = makeRun({ conclusion: 'failure' });
        const bad = makeJob({ id: 9, name: 'Semgrep', conclusion: 'failure' });
        const report = buildReport({ kind: 'failed', run, failedJobs: [bad] }, true);

        expect(report.exitCode).toBe(1);
        expect(report.fetchLogsFor).toStrictEqual([bad]);
        expect(report.lines.some((l) => l.text.includes('use --logs'))).toBeFalsy();
    });
});

describe('Ci-status emitReport', () => {
    it('roteia linhas info/error para o logger correspondente na ordem', () => {
        const info = vi.fn();
        const error = vi.fn();
        const report: Report = {
            lines: [
                { level: 'info', text: 'a' },
                { level: 'error', text: 'b' },
                { level: 'info', text: 'c' },
            ],
            exitCode: 1,
            fetchLogsFor: [],
        };

        emitReport(report, { info, error });

        expect(info.mock.calls).toStrictEqual([['a'], ['c']]);
        expect(error.mock.calls).toStrictEqual([['b']]);
    });
});

/**
 * Fake do ÚNICO boundary externo permitido: api.github.com.
 * O restante (classifyOutcome/buildReport/emitReport/runCiStatus) roda real.
 */
function makeFakeClient(responses: Record<string, unknown>, calls: string[], failOn?: string): CiHttpClient {
    return {
        get<T>(url: string): Promise<{ data: T }> {
            calls.push(url);
            if (failOn && url.includes(failOn)) {
                return Promise.reject(new Error(`Network error on ${url}`));
            }
            const key = Object.keys(responses).find((k) => url.includes(k));
            if (!key) return Promise.reject(new Error(`unexpected URL: ${url}`));
            return Promise.resolve({ data: responses[key] as T });
        },
    };
}

describe('Ci-status runCiStatus (integração real, boundary HTTP fake)', () => {
    it('no-runs: consulta apenas runs, loga aviso, exit 0, NAO consulta jobs', async () => {
        expect.assertions(4);

        const calls: string[] = [];
        const info = vi.fn();
        const error = vi.fn();
        const client = makeFakeClient({ '/actions/runs?': { workflow_runs: [] } }, calls);

        const code = await runCiStatus(client, 'o/r', 'dev', false, { info, error });

        expect(code).toBe(0);
        expect(calls).toStrictEqual(['/repos/o/r/actions/runs?branch=dev&per_page=5']);
        expect(info).toHaveBeenCalledWith('[ci-status] nenhum run encontrado em dev.');
        expect(error).not.toHaveBeenCalled();
    });

    it('in-progress: NAO consulta jobs e retorna exit 0', async () => {
        expect.assertions(3);

        const calls: string[] = [];
        const info = vi.fn();
        const client = makeFakeClient(
            { '/actions/runs?': { workflow_runs: [makeRun({ status: 'in_progress', conclusion: null })] } },
            calls,
        );

        const code = await runCiStatus(client, 'o/r', 'dev', false, { info, error: vi.fn() });

        expect(code).toBe(0);
        expect(calls.some((u) => u.includes('/jobs'))).toBeFalsy();
        expect(info).toHaveBeenCalledWith('[ci-status] run ainda em andamento.');
    });

    it('success: consulta runs + jobs, loga jobs e "CI verde.", exit 0', async () => {
        expect.assertions(4);

        const calls: string[] = [];
        const info = vi.fn();
        const run = makeRun({ id: 7, conclusion: 'success' });
        const client = makeFakeClient(
            {
                '/actions/runs?': { workflow_runs: [run] },
                '/actions/runs/7/jobs': { jobs: [makeJob({ name: 'Quality', conclusion: 'success' })] },
            },
            calls,
        );

        const code = await runCiStatus(client, 'o/r', 'dev', false, { info, error: vi.fn() });

        expect(code).toBe(0);
        expect(calls).toStrictEqual([
            '/repos/o/r/actions/runs?branch=dev&per_page=5',
            '/repos/o/r/actions/runs/7/jobs',
        ]);
        expect(info).toHaveBeenCalledWith('  Quality | conclusion=success');
        expect(info).toHaveBeenCalledWith('[ci-status] CI verde.');
    });

    it('failed sem --logs: exit 1, loga erro por job, NAO busca logs', async () => {
        expect.assertions(3);

        const calls: string[] = [];
        const info = vi.fn();
        const error = vi.fn();
        const run = makeRun({ id: 5, conclusion: 'failure' });
        const client = makeFakeClient(
            {
                '/actions/runs?': { workflow_runs: [run] },
                '/actions/runs/5/jobs': { jobs: [makeJob({ id: 88, name: 'Semgrep', conclusion: 'failure' })] },
            },
            calls,
        );

        const code = await runCiStatus(client, 'o/r', 'dev', false, { info, error });

        expect(code).toBe(1);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('FALHOU: Semgrep'));
        expect(calls.some((u) => u.includes('/jobs/88/logs'))).toBeFalsy();
    });

    it('failed com --logs: busca logs do job falho e escreve em stdout', async () => {
        expect.assertions(3);

        const calls: string[] = [];
        const info = vi.fn();
        const error = vi.fn();
        const run = makeRun({ id: 5, conclusion: 'failure' });
        const client = makeFakeClient(
            {
                '/actions/runs?': { workflow_runs: [run] },
                '/actions/runs/5/jobs': { jobs: [makeJob({ id: 88, name: 'Semgrep', conclusion: 'failure' })] },
                '/actions/jobs/88/logs': 'LOG CONTENT ERR line',
            },
            calls,
        );
        const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        try {
            const code = await runCiStatus(client, 'o/r', 'dev', true, { info, error });

            expect(code).toBe(1);
            expect(calls).toContain('/repos/o/r/actions/jobs/88/logs');
            expect(writeSpy).toHaveBeenCalledWith('LOG CONTENT ERR line');
        } finally {
            writeSpy.mockRestore();
        }
    });

    it('propaga erro do boundary HTTP na consulta de runs (nao silencia)', async () => {
        expect.assertions(1);

        const calls: string[] = [];
        const client = makeFakeClient({ '/actions/runs?': { workflow_runs: [] } }, calls, '/actions/runs?');

        await expect(runCiStatus(client, 'o/r', 'dev', false, { info: vi.fn(), error: vi.fn() })).rejects.toThrow(
            'Network error',
        );
    });

    it('propaga erro do boundary HTTP na consulta de jobs (nao silencia)', async () => {
        expect.assertions(1);

        const calls: string[] = [];
        const run = makeRun({ id: 5, conclusion: 'failure' });
        const client = makeFakeClient({ '/actions/runs?': { workflow_runs: [run] } }, calls, '/jobs');

        await expect(runCiStatus(client, 'o/r', 'dev', false, { info: vi.fn(), error: vi.fn() })).rejects.toThrow(
            'Network error',
        );
    });

    it('codifica branch com caracteres especiais na URL', async () => {
        expect.assertions(1);

        const calls: string[] = [];
        const client = makeFakeClient({ '/actions/runs?': { workflow_runs: [] } }, calls);

        await runCiStatus(client, 'o/r', 'feature/x y', false, { info: vi.fn(), error: vi.fn() });

        expect(calls[0]).toBe('/repos/o/r/actions/runs?branch=feature%2Fx%20y&per_page=5');
    });
});
