import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContext } from '../../shared/test-utils/factories/context-factory.js';

vi.mock('../../shared/prompt.js', () => ({
    ask: vi.fn().mockResolvedValue('test-value'),
    askMultiline: vi.fn().mockResolvedValue('test-value'),
    askConfirm: vi.fn().mockResolvedValue(true),
    askFilePath: vi.fn().mockResolvedValue(path.join(os.tmpdir(), 'qa-test.csv')),
    warn: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    print: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    printError: vi.fn(),
    printSummary: vi.fn(),
    withSpinner: vi.fn((_msg: string, fn: () => unknown) => fn()),
    showSelect: vi.fn(),
    showDashboardMenu: vi.fn(),
    divider: vi.fn(),
}));
vi.mock('../../shared/logger.js', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), writeFileOnly: vi.fn() },
    Logger: vi.fn().mockImplementation(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
    })),
}));
vi.mock('../../shared/jira-helper.js', () => ({
    safeJiraCall: vi.fn(async (c: unknown, op: string, label: string, fn: () => Promise<unknown>) => {
        try {
            await fn();
            (c as { pushHistory: (op: string, label: string, status: string) => void }).pushHistory(op, label, 'ok');
        } catch {
            (c as { pushHistory: (op: string, label: string, status: string) => void }).pushHistory(op, label, 'error');
        }
    }),
}));
vi.mock('../../shared/state.js', () => ({
    update: vi.fn(),
    load: vi.fn(() => ({})),
    loadState: vi.fn(() => ({})),
}));
vi.mock('../../shared/data-hub/global-hub.js', () => ({
    getDataHub: vi.fn(() => ({
        loadMetricsStore: vi.fn().mockReturnValue({ runs: [] }),
    })),
}));
vi.mock('../../shared/data-hub/compute/flakiness-entries.js', () => ({
    calcFlakinessEntries: vi.fn().mockReturnValue([]),
}));
vi.mock('../../shared/traceability-matrix.js', () => ({
    buildTraceabilityMatrix: vi.fn(() => ({
        nodes: [],
        totalEpics: 0,
        totalTests: 0,
        overallCoverage: 0,
        timestamp: '',
    })),
    generateTraceabilityHtml: vi.fn(() => '<html/>'),
}));
vi.mock('../../shared/health-score.js', () => ({
    calculateHealthScore: vi.fn(() => ({
        overall: 80,
        grade: 'good',
        qualityGate: 'pass',
        dimensions: {},
        runCount: 0,
        timestamp: '',
    })),
}));
vi.mock('../../shared/release-score.js', () => ({
    calculateReleaseScore: vi.fn(() => ({
        score: 85,
        grade: 'good',
        breakdown: [],
        recommendation: '',
        timestamp: '',
    })),
    generateReleaseScoreHtml: vi.fn(() => '<html/>'),
}));
vi.mock('../../shared/coverage-gap.js', () => ({
    analyzeCoverageGaps: vi.fn(() => ({ totals: { rawCoveragePct: 75, gap: 5 }, items: [], byEpic: {} })),
}));
vi.mock('../../shared/generate-coverage-gap-html.js', () => ({
    generateCoverageGapHtml: vi.fn(() => '<html/>'),
}));
vi.mock('../../shared/open.js', () => ({
    openWithFallback: vi.fn(),
}));
vi.mock('../../shared/temp-dir.js', () => ({
    writeReport: vi.fn(() => path.join(os.tmpdir(), 'qa-test-report.html')),
    reportsDir: vi.fn(() => path.join(os.tmpdir(), 'qa-test-reports')),
}));
vi.mock('../../shared/first-run.js', () => ({
    maybeRunFirstRunWizard: vi.fn(),
}));
vi.mock('../commands/test-execution-flow.js', () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../create_tests.js', () => ({
    default: {
        createTestsFromCsv: vi
            .fn()
            .mockResolvedValue({ inMemoryTasksId: [], inMemoryTasksText: [], summary: '', status: 'ok' }),
        createTestsFromJson: vi
            .fn()
            .mockResolvedValue({ inMemoryTasksId: [], inMemoryTasksText: [], summary: '', status: 'ok' }),
    },
}));
vi.mock('../../shared/dashboard-menu.js', () => ({
    showDashboardMenu: vi.fn(),
}));

async function getCommandsIndex(): Promise<{ getHandler: (id: string) => unknown }> {
    return import('../commands/index.js');
}

describe('Jira_management — getHandler registry', () => {
    let getHandler: (id: string) => unknown;

    beforeAll(async () => {
        const mod = await getCommandsIndex();
        getHandler = mod.getHandler;
    });

    beforeEach(() => vi.clearAllMocks());

    it('returns handler for case01', () => {
        expect.hasAssertions();

        const handler = getHandler('1');

        expect(handler).toBeDefined();
        expect(typeof handler).toBe('function');
    });

    it('returns handler for all 27 cases', () => {
        expect.hasAssertions();

        const cases = [
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
            '7',
            '8',
            '9',
            '10',
            '11',
            '12',
            '13',
            '14',
            '15',
            '16',
            '17',
            '18',
            '19',
            '20',
            '21',
            '22',
            '23',
            '24',
            '25',
            '26',
            '27',
        ];
        for (const c of cases) {
            const handler = getHandler(c);

            expect(handler).toBeDefined();
        }
    });

    it('returns handler for caseD (dashboards)', () => {
        expect.hasAssertions();

        const handler = getHandler('d');

        expect(handler).toBeDefined();
    });

    it('returns null for unknown case', () => {
        expect.hasAssertions();

        const handler = getHandler('99');

        expect(handler).toBeNull();
    });

    it('each handler is callable without throwing', async () => {
        expect.hasAssertions();

        const cases = ['3', '5', '7', '9', '11', '13', '25', '26', '27'];
        for (const c of cases) {
            const handler = getHandler(c);

            expect(handler).not.toBeNull();

            const ctx = createMockContext();
            const fn = handler as (ctx: ReturnType<typeof createMockContext>) => Promise<boolean | void>;

            await expect(fn(ctx)).resolves.not.toThrow();
        }
    });
});

describe('Jira_management — case handlers are connected', () => {
    let getHandler: (id: string) => unknown;

    beforeAll(async () => {
        const mod = await getCommandsIndex();
        getHandler = mod.getHandler;
    });

    beforeEach(() => vi.clearAllMocks());

    it('case01 is registered and returns a handler', () => {
        expect.hasAssertions();

        const handler = getHandler('1');

        expect(handler).toBeDefined();
        expect(typeof handler).toBe('function');
    });

    it('case09 updates project name', async () => {
        expect.assertions(2);

        const handler = getHandler('9');

        expect(handler).not.toBeNull();

        const ctx = createMockContext();
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('NEW_PROJ');
        await (handler as (ctx: ReturnType<typeof createMockContext>) => Promise<boolean | void>)(ctx);

        expect(ctx.ctx.project_name).toBe('NEW_PROJ');
    });

    it('case25 loads metrics and builds matrix', async () => {
        expect.hasAssertions();

        const handler = getHandler('25');

        expect(handler).not.toBeNull();

        const ctx = createMockContext();
        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        vi.mocked(getDataHub).mockReturnValue({
            loadMetricsStore: vi.fn().mockReturnValue({ runs: [] }),
        } as never);
        await (handler as (ctx: ReturnType<typeof createMockContext>) => Promise<boolean | void>)(ctx);

        expect(vi.mocked(getDataHub)).toHaveBeenCalledWith();
    });

    it('case26 calculates release score', async () => {
        expect.hasAssertions();

        const handler = getHandler('26');

        expect(handler).not.toBeNull();

        const ctx = createMockContext();
        const { getDataHub } = await import('../../shared/data-hub/global-hub.js');
        vi.mocked(getDataHub).mockReturnValue({
            loadMetricsStore: vi.fn().mockReturnValue({ runs: [] }),
        } as never);
        await (handler as (ctx: ReturnType<typeof createMockContext>) => Promise<boolean | void>)(ctx);

        expect(vi.mocked(getDataHub)).toHaveBeenCalledWith();
    });

    it('case27 analyzes coverage gaps', async () => {
        expect.hasAssertions();

        const handler = getHandler('27');

        expect(handler).not.toBeNull();

        const ctx = createMockContext();
        const { analyzeCoverageGaps } = await import('../../shared/coverage-gap.js');
        await (handler as (ctx: ReturnType<typeof createMockContext>) => Promise<boolean | void>)(ctx);

        expect(vi.mocked(analyzeCoverageGaps)).toHaveBeenCalledWith(expect.anything(), expect.any(String));
    });
});
