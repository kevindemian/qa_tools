const { mockCpExecFileSync, mockFsExistsSync, mockFsReadFileSync } = vi.hoisted(() => ({
    mockCpExecFileSync: vi.fn(),
    mockFsExistsSync: vi.fn<(...args: unknown[]) => boolean>(),
    mockFsReadFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
    default: { execFileSync: mockCpExecFileSync },
    execFileSync: mockCpExecFileSync,
}));

vi.mock('fs', () => ({
    default: { existsSync: mockFsExistsSync, readFileSync: mockFsReadFileSync },
    existsSync: mockFsExistsSync,
    readFileSync: mockFsReadFileSync,
}));
vi.mock('../../shared/prompt');
vi.mock('../../shared/logger');
vi.mock('../../shared/test-impact', () => ({
    analyzeTestImpact: vi.fn(),
}));
vi.mock('../../shared/metrics', () => ({
    loadMetrics: vi.fn(),
    calculateFlakiness: vi.fn(),
}));
vi.mock('../../shared/logger', () => ({
    rootLogger: {
        error: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

import { execFileSync } from 'child_process';
import { existsSync, PathLike } from 'fs';
import { ask, info, warn, title, printError } from '../../shared/prompt.js';
import { analyzeTestImpact } from '../../shared/test-impact.js';
import { loadMetrics, calculateFlakiness } from '../../shared/metrics.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';
import case22Module from './case22.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockAsk = vi.mocked(ask);
const mockAnalyzeTestImpact = vi.mocked(analyzeTestImpact);
const mockLoadMetrics = vi.mocked(loadMetrics);
const mockCalcFlaky = vi.mocked(calculateFlakiness);

beforeEach(() => {
    vi.clearAllMocks();
    mockLoadMetrics.mockReturnValue({ runs: [] });
    mockCalcFlaky.mockReturnValue([]);
});

describe('case22 — Test Impact Analysis', () => {
    it('analyzes test impact from git diff', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecFileSync.mockReturnValue('src/login.ts\nsrc/auth.ts\n');
        mockExistsSync.mockReturnValue(false);
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/login.ts', 'src/auth.ts'],
            impactedTests: [{ testKey: 'PROJ-42', title: 'Login test', matchMode: 'mapping', reason: 'mapping match' }],
            unaffected: { total: 10, skippedDueTo: [] },
            confidence: 'high',
        });

        const mod = case22Module;
        await mod.handler(makeMockCommandContext());

        expect(mockAnalyzeTestImpact).toHaveBeenCalled();
        expect(title).toHaveBeenCalledWith('TEST IMPACT ANALYSIS');
    });

    it('uses HEAD~1 as default range', async () => {
        mockAsk.mockResolvedValue('');
        mockExecFileSync.mockReturnValue('src/file.ts\n');
        mockExistsSync.mockReturnValue(false);
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/file.ts'],
            impactedTests: [],
            unaffected: { total: 0, skippedDueTo: [] },
            confidence: 'low',
        });

        const mod = case22Module;
        await mod.handler(makeMockCommandContext());

        expect(mockExecFileSync).toHaveBeenCalledWith('git', ['diff', '--name-only', 'HEAD~1'], { encoding: 'utf8' });
    });

    it('shows info when no diff changes found', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecFileSync.mockReturnValue('');
        mockExistsSync.mockReturnValue(false);

        const mod = case22Module;
        const result = await mod.handler(makeMockCommandContext());

        expect(result).toBe(false);
        expect(info).toHaveBeenCalledWith('Nenhuma alteração encontrada.');
    });

    it('handles git diff failure gracefully', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecFileSync.mockImplementation(() => {
            throw new Error('fatal: not a git repository');
        });

        const mod = case22Module;
        const result = await mod.handler(makeMockCommandContext());

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith('Falha ao obter git diff', expect.any(Error));
    });

    it('populates inMemoryTasksId with impacted test keys', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecFileSync.mockReturnValue('src/login.ts\n');
        mockExistsSync.mockReturnValue(false);
        mockLoadMetrics.mockReturnValue({ runs: [] });
        mockCalcFlaky.mockReturnValue([]);
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/login.ts'],
            impactedTests: [{ testKey: 'PROJ-42', title: 'Login test', matchMode: 'mapping', reason: 'mapping match' }],
            unaffected: { total: 10, skippedDueTo: [] },
            confidence: 'high',
        });

        const ctx = makeMockCommandContext();
        const mod = case22Module;
        await mod.handler(ctx);

        expect(ctx.ctx.inMemoryTasksId).toContain('PROJ-42');
        expect(info).toHaveBeenCalledWith(expect.stringContaining('pré-carregado'));
    });

    it('shows gap hint when confidence is low', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecFileSync.mockReturnValue('src/unknown.ts\n');
        mockExistsSync.mockReturnValue(false);
        mockLoadMetrics.mockReturnValue({ runs: [] });
        mockCalcFlaky.mockReturnValue([]);
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/unknown.ts'],
            impactedTests: [{ testKey: 'PROJ-99', title: 'Unknown', matchMode: 'keyword', reason: 'keyword match' }],
            unaffected: { total: 0, skippedDueTo: [] },
            confidence: 'low',
        });

        const mod = case22Module;
        await mod.handler(makeMockCommandContext());

        expect(info).toHaveBeenCalledWith(expect.stringContaining('Gap Analysis'));
    });

    it('warns about flaky impacted tests', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecFileSync.mockReturnValue('src/login.ts\n');
        mockExistsSync.mockReturnValue(false);
        mockLoadMetrics.mockReturnValue({
            runs: [
                {
                    timestamp: '2026-01-01T00:00:00.000Z',
                    project: 'TEST',
                    total: 10,
                    passed: 5,
                    failed: 5,
                    skipped: 0,
                    duration: 100,
                    tests: [{ title: 'Login test', state: 'failed', duration: 100 }],
                },
            ],
        });
        mockCalcFlaky.mockReturnValue([
            { title: 'Login test', passCount: 1, failCount: 2, skipCount: 0, totalRuns: 3, rate: 0.66 },
        ]);
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/login.ts'],
            impactedTests: [{ testKey: 'PROJ-42', title: 'Login test', matchMode: 'mapping', reason: 'mapping match' }],
            unaffected: { total: 10, skippedDueTo: [] },
            confidence: 'high',
        });

        const mod = case22Module;
        await mod.handler(makeMockCommandContext());

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('flaky'));
    });

    it('loads mapping file when it exists', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecFileSync.mockReturnValue('src/login.ts\n');
        mockExistsSync.mockImplementation((p: PathLike) => typeof p === 'string' && p.includes('test-mapping.json'));
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/login.ts'],
            impactedTests: [
                { testKey: 'PROJ-1', title: 'Login SSO', matchMode: 'mapping', reason: 'explicit mapping' },
            ],
            unaffected: { total: 0, skippedDueTo: [] },
            confidence: 'high',
        });

        const mod = case22Module;
        await mod.handler(makeMockCommandContext());

        expect(mockAnalyzeTestImpact).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                mappingPath: 'config/test-mapping.json',
            }),
        );
    });
});
