jest.mock('child_process');
jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return { ...actual, existsSync: jest.fn(), readFileSync: jest.fn() };
});
jest.mock('../../shared/prompt', () => ({
    ask: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    tableView: jest.fn(),
    printError: jest.fn(),
}));
jest.mock('../../shared/test-impact', () => ({
    analyzeTestImpact: jest.fn(),
}));
jest.mock('../../shared/metrics', () => ({
    loadMetrics: jest.fn(),
    calculateFlakiness: jest.fn(),
}));
jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { ask, info, warn, title, printError } from '../../shared/prompt';
import { analyzeTestImpact } from '../../shared/test-impact';
import { loadMetrics, calculateFlakiness } from '../../shared/metrics';

const mockExecSync = execSync as jest.Mock;
const mockExistsSync = existsSync as jest.Mock;
const mockAsk = ask as jest.Mock;
const mockAnalyzeTestImpact = analyzeTestImpact as jest.Mock;
const mockLoadMetrics = loadMetrics as jest.Mock;
const mockCalcFlaky = calculateFlakiness as jest.Mock;

function makeContext(overrides?: Record<string, unknown>) {
    return {
        jiraResource: {},
        jiraResourceXray: {},
        linkManager: {},
        linkManagerXray: {},
        csvResource: {},
        ctx: {
            project_name: 'TEST',
            inMemoryTasksId: [],
            inMemoryTasksText: [],
            sessionCounters: [],
            isBusy: false,
            results: [],
        },
        pushHistory: jest.fn(),
        printSessionSummary: jest.fn(),
        base_url: 'https://jira.test.com',
        sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }) },
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockLoadMetrics.mockReturnValue({ runs: [] });
    mockCalcFlaky.mockReturnValue([]);
});

describe('case22 — Test Impact Analysis', () => {
    it('analyzes test impact from git diff', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecSync.mockReturnValue('src/login.ts\nsrc/auth.ts\n');
        mockExistsSync.mockReturnValue(false);
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/login.ts', 'src/auth.ts'],
            impactedTests: [{ testKey: 'PROJ-42', title: 'Login test', matchMode: 'mapping', reason: 'mapping match' }],
            unaffected: { total: 10, skippedDueTo: [] },
            confidence: 'high',
        });

        const mod = require('./case22').default;
        await mod.handler(makeContext());

        expect(mockAnalyzeTestImpact).toHaveBeenCalled();
        expect(title).toHaveBeenCalledWith('TEST IMPACT ANALYSIS');
    });

    it('uses HEAD~1 as default range', async () => {
        mockAsk.mockResolvedValue('');
        mockExecSync.mockReturnValue('src/file.ts\n');
        mockExistsSync.mockReturnValue(false);
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/file.ts'],
            impactedTests: [],
            unaffected: { total: 0, skippedDueTo: [] },
            confidence: 'low',
        });

        const mod = require('./case22').default;
        await mod.handler(makeContext());

        expect(mockExecSync).toHaveBeenCalledWith('git diff --name-only HEAD~1', expect.any(Object));
    });

    it('shows info when no diff changes found', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecSync.mockReturnValue('');
        mockExistsSync.mockReturnValue(false);

        const mod = require('./case22').default;
        const result = await mod.handler(makeContext());

        expect(result).toBe(false);
        expect(info).toHaveBeenCalledWith('Nenhuma alteração encontrada.');
    });

    it('handles git diff failure gracefully', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecSync.mockImplementation(() => {
            throw new Error('fatal: not a git repository');
        });

        const mod = require('./case22').default;
        const result = await mod.handler(makeContext());

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith('Falha ao obter git diff', expect.any(Error));
    });

    it('populates inMemoryTasksId with impacted test keys', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecSync.mockReturnValue('src/login.ts\n');
        mockExistsSync.mockReturnValue(false);
        mockLoadMetrics.mockReturnValue({ runs: [] });
        mockCalcFlaky.mockReturnValue([]);
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/login.ts'],
            impactedTests: [{ testKey: 'PROJ-42', title: 'Login test', matchMode: 'mapping', reason: 'mapping match' }],
            unaffected: { total: 10, skippedDueTo: [] },
            confidence: 'high',
        });

        const ctx = makeContext();
        const mod = require('./case22').default;
        await mod.handler(ctx);

        expect(ctx.ctx.inMemoryTasksId).toContain('PROJ-42');
        expect(info).toHaveBeenCalledWith(expect.stringContaining('pré-carregado'));
    });

    it('shows gap hint when confidence is low', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecSync.mockReturnValue('src/unknown.ts\n');
        mockExistsSync.mockReturnValue(false);
        mockLoadMetrics.mockReturnValue({ runs: [] });
        mockCalcFlaky.mockReturnValue([]);
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/unknown.ts'],
            impactedTests: [{ testKey: 'PROJ-99', title: 'Unknown', matchMode: 'keyword', reason: 'keyword match' }],
            unaffected: { total: 0, skippedDueTo: [] },
            confidence: 'low',
        });

        const mod = require('./case22').default;
        await mod.handler(makeContext());

        expect(info).toHaveBeenCalledWith(expect.stringContaining('Gap Analysis'));
    });

    it('warns about flaky impacted tests', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecSync.mockReturnValue('src/login.ts\n');
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

        const mod = require('./case22').default;
        await mod.handler(makeContext());

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('flaky'));
    });

    it('loads mapping file when it exists', async () => {
        mockAsk.mockResolvedValue('HEAD~1');
        mockExecSync.mockReturnValue('src/login.ts\n');
        mockExistsSync.mockImplementation((p: string) => p.includes('test-mapping.json'));
        mockAnalyzeTestImpact.mockReturnValue({
            changedFiles: ['src/login.ts'],
            impactedTests: [
                { testKey: 'PROJ-1', title: 'Login SSO', matchMode: 'mapping', reason: 'explicit mapping' },
            ],
            unaffected: { total: 0, skippedDueTo: [] },
            confidence: 'high',
        });

        const mod = require('./case22').default;
        await mod.handler(makeContext());

        expect(mockAnalyzeTestImpact).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                mappingPath: expect.stringContaining('test-mapping.json'),
            }),
        );
    });
});
