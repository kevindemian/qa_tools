/**
 * Tests for github-check-run.ts.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createCheckRun } from './github-check-run.js';

vi.mock('./deps.js', async () => {
    const actual = await vi.importActual('./deps.js');
    return {
        ...(actual as Record<string, unknown>),
        axios: {
            post: vi.fn(),
        },
    };
});

const mockAxios = await (async () => {
    const mod = await import('./deps.js');
    return mod.axios as unknown as { post: ReturnType<typeof vi.fn> };
})();

describe('createCheckRun', () => {
    const originalEnv = { ...process.env };
    let penv = process.env as Record<string, string | undefined>;

    beforeEach(() => {
        penv = process.env;
        vi.clearAllMocks();
        penv['GITHUB_TOKEN'] = 'test-token';
        penv['GITHUB_REPOSITORY'] = 'owner/repo';
        penv['GITHUB_SHA'] = 'abc123def456';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('sends POST to correct GitHub API URL', async () => {
        mockAxios.post.mockResolvedValueOnce({
            data: { id: 1, html_url: 'https://github.com/owner/repo/checks/1' },
        });

        const result = await createCheckRun({
            name: 'Quality Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockAxios.post).toHaveBeenCalledWith(
            'https://api.github.com/repos/owner/repo/check-runs',
            expect.objectContaining({
                name: 'Quality Gate',
                head_sha: 'abc123def456',
                status: 'completed',
                conclusion: 'success',
            }),
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) as Record<string, unknown>,
            }),
        );
        expect(result).toEqual({ id: 1, html_url: 'https://github.com/owner/repo/checks/1' });
    });

    it('includes output when provided', async () => {
        mockAxios.post.mockResolvedValueOnce({
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

        expect(mockAxios.post).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                output: {
                    title: '2 tests failed',
                    summary: 'Summary here',
                    text: 'Details here',
                },
            }),
            expect.any(Object),
        );
    });

    it('includes details_url when provided', async () => {
        mockAxios.post.mockResolvedValueOnce({
            data: { id: 3, html_url: '' },
        });

        await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
            detailsUrl: 'https://example.com/report',
        });

        expect(mockAxios.post).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                details_url: 'https://example.com/report',
            }),
            expect.any(Object),
        );
    });

    it('returns null when GITHUB_TOKEN is missing', async () => {
        delete penv['GITHUB_TOKEN'];

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockAxios.post).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('returns null when GITHUB_REPOSITORY is missing', async () => {
        delete penv['GITHUB_REPOSITORY'];

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockAxios.post).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('returns null when GITHUB_SHA is missing', async () => {
        delete penv['GITHUB_SHA'];

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockAxios.post).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('handles API error gracefully', async () => {
        mockAxios.post.mockRejectedValueOnce({
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
        mockAxios.post.mockRejectedValueOnce(new Error('Network error'));

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(result).toBeNull();
    });
});
