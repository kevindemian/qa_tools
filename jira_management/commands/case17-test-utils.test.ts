/**
 * Tests for case17-test-utils — fetchLatestTestRun and related CI integration.
 *
 * Strategy: mock HTTP client + AdmZip to simulate CI pipeline artifacts
 * without real network calls or ZIP handling. Verifies orchestration logic.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../shared/http-client', async () => ({
    createHttpClient: vi.fn(),
}));

vi.mock('../../shared/config', async () => ({
    default: {
        get: vi.fn((key: string) => {
            if (key === 'githubToken') return 'gh_token_abc';
            if (key === 'GITHUB_REPOSITORY') return 'owner/repo';
            if (key === 'CI_JOB_TOKEN') return '';
            return undefined;
        }),
        getDefault: vi.fn(() => ({
            get: vi.fn((key: string) => {
                if (key === 'githubToken') return 'gh_token_abc';
                return undefined;
            }),
        })),
    },
}));

vi.mock('../../shared/logger', async () => ({
    rootLogger: { warn: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn() }) },
}));

vi.mock('../../shared/deps', async () => ({
    AdmZip: class {
        entries: Array<{ name: string; getData: () => Buffer }>;
        constructor(data: Buffer) {
            /* Use data directly as JSON content (test passes pre-serialized) */
            this.entries = [{ name: 'ctrf.json', getData: () => data }];
        }
        getEntries() {
            return this.entries;
        }
    },
}));

import { createHttpClient } from '../../shared/http-client.js';

const CTRF_SAMPLE = {
    reportFormat: 'CTRF',
    specVersion: '1.0',
    results: {
        summary: { tests: 2, passed: 1, failed: 1, skipped: 0 },
        tests: [
            { name: 'Passing test', status: 'passed', duration: 100 },
            { name: 'Failing test', status: 'failed', duration: 200, message: 'Assertion failed' },
        ],
    },
};

describe('fetchLatestTestRun', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves GitHub run with CTRF artifact and returns ParseResult', async () => {
        const mockGet = vi.fn();
        mockGet
            .mockResolvedValueOnce({
                data: { workflow_runs: [{ id: 123, created_at: '2026-06-01T00:00:00Z' }] },
            })
            .mockResolvedValueOnce({
                data: { artifacts: [{ id: 456, name: 'ctrf-report' }] },
            })
            .mockResolvedValueOnce({
                data: Buffer.from(JSON.stringify(CTRF_SAMPLE)),
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./case17-test-utils.js');
        const result = await fetchLatestTestRun();
        expect(result).not.toBeNull();
        if (result) {
            expect(result.tests).toHaveLength(2);
            expect(result.stats.passed).toBe(1);
            expect(result.stats.failed).toBe(1);
            expect(result.stats.total).toBe(2);
        }
    });

    it('returns null when no runs found', async () => {
        const mockGet = vi.fn().mockResolvedValueOnce({
            data: { workflow_runs: [] },
        });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./case17-test-utils.js');
        const result = await fetchLatestTestRun();
        expect(result).toBeNull();
    });

    it('returns null when no CTRF artifact in latest run', async () => {
        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({
                data: { workflow_runs: [{ id: 123, created_at: '2026-06-01T00:00:00Z' }] },
            })
            .mockResolvedValueOnce({
                data: { artifacts: [{ id: 789, name: 'coverage-report' }] },
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./case17-test-utils.js');
        const result = await fetchLatestTestRun();
        expect(result).toBeNull();
    });

    it('returns null when CI returns no runs', async () => {
        /* With tokens configured, if the API returns an empty runs list, result is null */
        const mockGet = vi.fn().mockResolvedValueOnce({
            data: { workflow_runs: [] },
        });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./case17-test-utils.js');
        const result = await fetchLatestTestRun();
        expect(result).toBeNull();
    });
});
