/**
 * Tests for github-check-run.ts.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createCheckRun, getCheckRuns } from './github-check-run.js';

const mockPost = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const mockGet = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock('./deps.js', async () => {
    const actual = await vi.importActual('./deps.js');
    return {
        ...(actual as object),
        axios: {
            post: mockPost,
            get: mockGet,
        },
    };
});

describe('CreateCheckRun', () => {
    const originalEnv = { ...process.env };
    const envKeys = ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_SHA'] as const;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env['GITHUB_TOKEN'] = 'test-token';
        process.env['GITHUB_REPOSITORY'] = 'owner/repo';
        process.env['GITHUB_SHA'] = 'abc123def456';
        delete process.env['VITEST'];
    });

    afterEach(() => {
        for (const key of envKeys) {
            const orig = originalEnv[key];
            if (orig === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = orig;
            }
        }
    });

    it('sends POST to correct GitHub API URL', async () => {
        expect.assertions(2);

        mockPost.mockResolvedValueOnce({
            data: { id: 1, html_url: 'https://github.com/owner/repo/checks/1' },
        });

        const result = await createCheckRun({
            name: 'Quality Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockPost).toHaveBeenCalledTimes(1);
        expect(result).toStrictEqual({ id: 1, html_url: 'https://github.com/owner/repo/checks/1' });
    });

    it('includes output when provided', async () => {
        expect.assertions(1);

        mockPost.mockResolvedValueOnce({
            data: { id: 2, html_url: '' },
        });

        await createCheckRun({
            name: 'Test',
            status: 'completed',
            conclusion: 'failure',
            output: {
                title: '2 tests failed',
                summary: 'Summary here',
                text: 'Details here',
            },
        });

        const callArgs = mockPost.mock.calls[0] as unknown[];
        const body = callArgs[1] as { output?: { title: string; summary: string; text: string } };

        expect(body.output).toStrictEqual({
            title: '2 tests failed',
            summary: 'Summary here',
            text: 'Details here',
        });
    });

    it('includes details_url when provided', async () => {
        expect.assertions(1);

        mockPost.mockResolvedValueOnce({
            data: { id: 3, html_url: '' },
        });

        await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
            detailsUrl: 'https://example.com/report',
        });

        const callArgs = mockPost.mock.calls[0] as unknown[];
        const body = callArgs[1] as { details_url?: string };

        expect(body.details_url).toBe('https://example.com/report');
    });

    it.each<[string, () => void]>([
        ['GITHUB_TOKEN', () => delete process.env['GITHUB_TOKEN']],
        ['GITHUB_REPOSITORY', () => delete process.env['GITHUB_REPOSITORY']],
        ['GITHUB_SHA', () => delete process.env['GITHUB_SHA']],
    ])('returns null when %s is missing', async (_envKey, removeEnv) => {
        expect.assertions(2);

        removeEnv();

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockPost).toHaveBeenCalledTimes(0);
        expect(result).toBeNull();
    });

    it('handles API error gracefully', async () => {
        expect.assertions(1);

        mockPost.mockRejectedValueOnce({
            response: { status: 403 },
            message: 'Forbidden',
        });

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(result).toBeNull();
    });

    it('handles network error gracefully', async () => {
        expect.assertions(1);

        mockPost.mockRejectedValueOnce(new Error('Network error'));

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(result).toBeNull();
    });
});

describe('GetCheckRuns', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env['GITHUB_TOKEN'] = 'test-token';
        process.env['GITHUB_REPOSITORY'] = 'owner/repo';
        process.env['GITHUB_SHA'] = 'abc123def456';
        delete process.env['VITEST'];
    });

    afterEach(() => {
        for (const key of ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_SHA'] as const) {
            const orig = originalEnv[key];
            if (orig === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = orig;
            }
        }
    });

    it('returns check runs from API', async () => {
        expect.assertions(3);

        mockGet.mockResolvedValueOnce({
            data: {
                total_count: 1,
                check_runs: [{ id: 1, name: 'Quality Gate', status: 'completed', conclusion: 'success' }],
            },
        });
        mockGet.mockResolvedValueOnce({ data: [] });

        const result = await getCheckRuns('abc123');

        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('Quality Gate');
    });

    it('returns empty array when GITHUB_TOKEN is missing', async () => {
        expect.assertions(2);

        delete process.env['GITHUB_TOKEN'];

        const result = await getCheckRuns('abc123');

        expect(mockGet).toHaveBeenCalledTimes(0);
        expect(result).toStrictEqual([]);
    });

    it('returns empty array when GITHUB_REPOSITORY is missing', async () => {
        expect.assertions(2);

        delete process.env['GITHUB_REPOSITORY'];

        const result = await getCheckRuns('abc123');

        expect(mockGet).toHaveBeenCalledTimes(0);
        expect(result).toStrictEqual([]);
    });

    it('returns empty array on API error', async () => {
        expect.assertions(1);

        mockGet.mockRejectedValueOnce({ response: { status: 403 }, message: 'Forbidden' });

        const result = await getCheckRuns('abc123');

        expect(result).toStrictEqual([]);
    });

    it('returns empty array on network error', async () => {
        expect.assertions(1);

        mockGet.mockRejectedValueOnce(new Error('Network error'));

        const result = await getCheckRuns('abc123');

        expect(result).toStrictEqual([]);
    });
});

describe('VITEST guard', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env['GITHUB_TOKEN'] = 'test-token';
        process.env['GITHUB_REPOSITORY'] = 'owner/repo';
        process.env['GITHUB_SHA'] = 'abc123def456';
        process.env['VITEST'] = 'true';
    });

    afterEach(() => {
        for (const key of ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_SHA', 'VITEST'] as const) {
            const orig = originalEnv[key];
            if (orig === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = orig;
            }
        }
    });

    it('createCheckRun returns null without making API calls', async () => {
        expect.assertions(2);

        const result = await createCheckRun({
            name: 'Test',
            status: 'completed',
            conclusion: 'success',
        });

        expect(result).toBeNull();
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('getCheckRuns returns empty array without making API calls', async () => {
        expect.assertions(2);

        const result = await getCheckRuns('abc123');

        expect(result).toStrictEqual([]);
        expect(mockGet).not.toHaveBeenCalled();
    });
});
