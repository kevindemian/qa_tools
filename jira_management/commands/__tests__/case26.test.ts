/**
 * Tests for case26 — Release Score.
 *
 * Anti-mock-theater: the release-score flow runs REAL and integrated.
 * A real DataHub is built via `DataHubImpl.createFromParseResult` and the
 * real `generateReleaseScoreHtml` renderer runs on its `computed.releaseScore`.
 * Only infrastructure/terminal boundaries are mocked (browser, temp-dir, prompt).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockOpen, mockWriteReport } = vi.hoisted(() => ({
    mockOpen: vi.fn(),
    mockWriteReport: vi.fn().mockReturnValue('/test/qa-test/release-score.html'),
}));

vi.mock('../../../shared/ui/prompt.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    title: vi.fn(),
    printError: vi.fn(),
}));

vi.mock('../../../shared/logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../../shared/data-hub/global-hub.js', () => ({
    getDataHub: vi.fn(),
}));

vi.mock('../../../shared/open', () => ({
    openWithFallback: mockOpen,
}));

vi.mock('../../../shared/infra/temp-dir.js', () => ({
    writeReport: mockWriteReport,
}));

vi.mock('../../../shared/ui/output.js', () => ({
    defaultOutput: { print: vi.fn() },
}));

import { warn, printError } from '../../../shared/ui/prompt.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import { getDataHub } from '../../../shared/data-hub/global-hub.js';
import { DataHubImpl } from '../../../shared/data-hub/hub.js';
import { makeDataHubPersistenceMock } from '../../../shared/test-utils/factories/data-hub-mock.js';
import case26 from '../case26.js';

/** Build a REAL DataHub from a real parse result (2 passed tests). */
function buildRealHub(): DataHubImpl {
    const parseResult = {
        framework: 'jest',
        tests: [
            { title: 'test A', state: 'passed' as const, duration: 100 },
            { title: 'test B', state: 'passed' as const, duration: 120 },
        ],
        stats: { passed: 2, failed: 0, skipped: 0, total: 2, duration: 220 },
    };
    return DataHubImpl.createFromParseResult(parseResult, 'test/repo', makeDataHubPersistenceMock());
}

describe('Case26', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockWriteReport.mockReturnValue('/test/qa-test/release-score.html');
        vi.mocked(getDataHub).mockReturnValue(buildRealHub());
    });

    describe('Handler export', () => {
        it('exports a handler function', () => {
            expect(case26).toBeDefined();
            expect(typeof case26.handler).toBe('function');
        });
    });

    describe('Project validation', () => {
        it('warns when no project selected', async () => {
            expect.hasAssertions();

            const ctx = makeMockCommandContext({ ctx: { project_name: '' } });
            await case26.handler(ctx);

            expect(warn).toHaveBeenCalledWith('Nenhum projeto Jira selecionado.');
        });
    });

    describe('Release score — real integrated flow', () => {
        it('reads the release score computed by the real DataHub and renders real HTML', async () => {
            expect.hasAssertions();

            const ctx = makeMockCommandContext({ ctx: { project_name: 'TEST' } });
            await case26.handler(ctx);

            expect(getDataHub).toHaveBeenCalledWith();

            const html = mockWriteReport.mock.calls[0]?.[1] as string;

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Pass Rate');
            expect(html).toContain('Insufficient data');
            expect(html).toContain('data-part="timestamp"');
            expect(html).toContain('data-dashboard="release-score"');
        });

        it('writes the report with the project-specific filename', async () => {
            expect.hasAssertions();

            const ctx = makeMockCommandContext({ ctx: { project_name: 'TEST' } });
            await case26.handler(ctx);

            expect(mockWriteReport).toHaveBeenCalledWith('release-score-TEST.html', expect.any(String));
        });

        it('opens the report in the browser', async () => {
            expect.hasAssertions();

            const ctx = makeMockCommandContext({ ctx: { project_name: 'TEST' } });
            await case26.handler(ctx);

            expect(mockOpen).toHaveBeenCalledWith(
                '/test/qa-test/release-score.html',
                'Release Score',
                expect.any(Function),
            );
        });

        it('records history on success', async () => {
            expect.hasAssertions();

            const ctx = makeMockCommandContext({ ctx: { project_name: 'TEST' } });
            await case26.handler(ctx);

            expect(ctx.pushHistory).toHaveBeenCalledWith('release-score', 'TEST', 'ok');
        });

        it('renders an explicit insufficient-data state when no dimension has data', async () => {
            expect.hasAssertions();

            // A truly empty hub has no run/coverage/timing/artifact sources:
            // every release-score dimension is unavailable (never a fabricated 0).
            const emptyHub = DataHubImpl.createEmpty('github', 'test/repo', makeDataHubPersistenceMock());
            vi.mocked(getDataHub).mockReturnValue(emptyHub);
            const ctx = makeMockCommandContext({ ctx: { project_name: 'TEST' } });
            await case26.handler(ctx);

            const html = mockWriteReport.mock.calls[0]?.[1] as string;

            expect(html).toContain('Insufficient data for release score');
        });

        it('calls printError on failure', async () => {
            expect.hasAssertions();

            vi.mocked(getDataHub).mockImplementation(() => {
                throw new Error('store read failed');
            });

            const ctx = makeMockCommandContext({ ctx: { project_name: 'TEST' } });
            await case26.handler(ctx);

            expect(printError).toHaveBeenCalledWith('Erro ao gerar Release Score', expect.any(Error));
        });
    });
});
