/**
 * E2E — Quality Gate through the full PR-report pipeline (FT-10 D1–D5 / F1–F2 / EIXO C).
 *
 * Real pipeline: DataProvider (external, mocked) → DataHubImpl.create → computeMetrics →
 * generatePrReport → runQualityGate (handleQualityGate) → buildQualityGateSectionMd →
 * generateHtmlReportFile → postPrComment. Only EXTERNAL boundaries are mocked:
 *   - GitHub HTTP: createCheckRun (ci/github-check-run.js) and postPrComment (ci/github-pr-comment.js)
 *   - Filesystem writes (HTML report + GITHUB_STEP_SUMMARY job summary)
 *
 * ALL local business logic runs real: DataHubImpl gating/provenance, computeMetrics,
 * runQualityGate, buildQualityGateSectionMd, generateHtmlReport (AGENTS §26.2).
 *
 * Coverage (per plan — negative/edge first):
 *   - D2/D3: skipQuality → HTML has NO gate section (D2)   |   no skipQuality → composite gate (D3)
 *   - F2:    incompleteItems surfaced in check-run summary AND PR comment
 *   - EIXO C: absent categories reported as incompleteItems (never silent pass)
 *   - N/A:   non-finite values render as N/A, never NaN (Rule 24/25)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineRun, PipelineJob } from '../../shared/types/ci-cd.js';
import type { DataProvider, DataHub, RawData } from '../../shared/types/data-hub.js';
import { DataHubImpl } from '../../shared/data-hub/hub.js';
import { makeDataHubPersistenceMock } from '../../shared/test-utils/factories/data-hub-mock.js';
import { generatePrReport } from '../../shared/pr-report-core.js';

const mockCheckRun = vi.hoisted(() => ({ createCheckRun: vi.fn() }));
const mockPRComment = vi.hoisted(() => ({ postPrComment: vi.fn() }));

vi.mock('../../shared/ci/github-check-run.js', () => mockCheckRun);
vi.mock('../../shared/ci/github-pr-comment.js', () => mockPRComment);
vi.mock('../../shared/logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() },
}));

const summaryPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-qg-')), 'step-summary.md');

function makeRun(id: number, overrides?: Partial<PipelineRun>): PipelineRun {
    return {
        id,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:05:00Z',
        run_started_at: '2026-07-01T10:00:00Z',
        ...overrides,
    };
}

function makeJob(id: number, overrides?: Partial<PipelineJob>): PipelineJob {
    return {
        id,
        name: 'test',
        stage: 'test',
        status: 'success',
        duration: 120,
        ...overrides,
    };
}

/** Full raw data: runs + jobs + parsed test artifact (real computed metrics) + gated categories. */
function healthyRawData(): RawData {
    return {
        runs: [
            makeRun(1, { conclusion: 'success' }),
            makeRun(2, { conclusion: 'success' }),
            makeRun(3, { conclusion: 'success' }),
            makeRun(4, { conclusion: 'success' }),
            makeRun(5, { conclusion: 'failure' }),
        ],
        jobs: new Map<number, PipelineJob[]>([
            [1, [makeJob(10)]],
            [2, [makeJob(20)]],
            [3, [makeJob(30)]],
            [4, [makeJob(40)]],
            [5, [makeJob(50, { status: 'failure' })]],
        ]),
        artifacts: new Map(),
        failureReasons: new Map(),
        parsedArtifacts: new Map([
            [
                1,
                [
                    {
                        fileName: 'ctrf',
                        format: 'ctrf',
                        data: { tests: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 } },
                    },
                ],
            ],
        ]),
        coverage: { total: 100, covered: 85, percentage: 85 },
        coverageFiles: [{ file: 'src/a.ts', lines: { total: 10, covered: 10, percentage: 100 }, confidence: 0.9 }],
    };
}

/** Runs present but a needed category (e.g. failureRecords) absent → incompleteItems. */
function runsMissingCategoriesRawData(): RawData {
    return {
        runs: [
            makeRun(1, { conclusion: 'success' }),
            makeRun(2, { conclusion: 'success' }),
            makeRun(3, { conclusion: 'success' }),
        ],
        jobs: new Map<number, PipelineJob[]>([
            [1, [makeJob(10)]],
            [2, [makeJob(20)]],
            [3, [makeJob(30)]],
        ]),
        artifacts: new Map(),
        failureReasons: new Map(),
        coverageFiles: [{ file: 'src/a.ts', lines: { total: 10, covered: 10, percentage: 100 }, confidence: 0.9 }],
    };
}

async function buildHub(raw: RawData): Promise<DataHub> {
    const provider: DataProvider = {
        name: 'mock-github',
        source: 'github',
        fetchRawData: vi.fn().mockResolvedValue(raw),
    };
    const result = await DataHubImpl.create([provider], { repo: 'owner/repo' }, makeDataHubPersistenceMock());
    return result.hub;
}

describe('E2E: Quality Gate — Full PR Report Pipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckRun.createCheckRun.mockResolvedValue({ id: 1, html_url: 'https://example.com/check/1' });
        mockPRComment.postPrComment.mockResolvedValue({ html_url: 'https://example.com/pr#issuecomment-1' });
        process.env['GITHUB_STEP_SUMMARY'] = summaryPath;
    });

    afterAll(() => {
        delete process.env['GITHUB_STEP_SUMMARY'];
    });

    it('d3: no skipQuality → composite gate section rendered in HTML + check-run + PR comment', async () => {
        expect.hasAssertions();

        const hub = await buildHub(healthyRawData());
        const result = await generatePrReport({
            dataHub: hub,
            skipAi: true,
            skipFlaky: true,
            htmlOutputPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-html-')), 'pr.html'),
        });

        // check-run summary contains the SSOT gate section (health-score + gate conclusion)
        const checkCall = mockCheckRun.createCheckRun.mock.calls[0]?.[0] as
            { output?: { summary: string } } | undefined;

        expect(checkCall?.output?.summary).toContain('## Quality Gate:');
        expect(checkCall?.output?.summary).toContain('health-score');

        // PR comment contains the gate section too
        const commentBody = String(mockPRComment.postPrComment.mock.calls[0]?.[0]);

        expect(commentBody).toContain('## Quality Gate:');

        // HTML report rendered (file written) + composite gate component present
        expect(result.htmlPath).toBeTruthy();

        const html = fs.readFileSync(result.htmlPath as string, 'utf8');

        expect(html).toContain('data-component="quality-gate"');
        expect(html).toContain('health-score');
    });

    it('d2: skipQuality → NO quality gate section rendered anywhere', async () => {
        expect.hasAssertions();

        const hub = await buildHub(healthyRawData());
        const htmlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-html2-'));
        await generatePrReport({
            dataHub: hub,
            skipAi: true,
            skipFlaky: true,
            skipQuality: true,
            htmlOutputPath: path.join(htmlDir, 'pr.html'),
        });

        expect(mockCheckRun.createCheckRun).not.toHaveBeenCalled();

        const commentBody = String(mockPRComment.postPrComment.mock.calls[0]?.[0]);

        expect(commentBody).not.toContain('## Quality Gate:');

        const html = fs.readFileSync(path.join(htmlDir, 'pr.html'), 'utf8');

        expect(html).not.toContain('data-component="quality-gate"');
    });

    it('f2: incompleteItems surfaced in check-run summary AND PR comment (EIXO C absent categories)', async () => {
        expect.hasAssertions();

        const hub = await buildHub(runsMissingCategoriesRawData());
        const htmlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-html3-'));
        await generatePrReport({
            dataHub: hub,
            skipAi: true,
            skipFlaky: true,
            htmlOutputPath: path.join(htmlDir, 'pr.html'),
        });

        const checkCallF2 = mockCheckRun.createCheckRun.mock.calls[0]?.[0] as
            { output?: { summary: string } } | undefined;

        expect(checkCallF2?.output?.summary).toContain('**Dados ausentes (EIXO C):**');
        expect(checkCallF2?.output?.summary).toContain('failureRecords');
        expect(checkCallF2?.output?.summary).toContain('securityFindings');

        const commentBody = String(mockPRComment.postPrComment.mock.calls[0]?.[0]);

        expect(commentBody).toContain('**Dados ausentes (EIXO C):**');
        expect(commentBody).toContain('failureRecords');

        // N/A: never NaN (Rule 24/25) in the gate markdown
        expect(checkCallF2?.output?.summary).not.toContain('NaN');
        expect(commentBody).not.toContain('NaN');
    });
});
