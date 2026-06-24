/**
 * Tests for github-check-run.ts.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createCheckRun } from './github-check-run.js';

const mockPost = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock('./deps.js', async () => {
    const actual = await vi.importActual('./deps.js');
    return {
        ...(actual as Record<string, unknown>),
        axios: {
            post: mockPost,
        },
    };
});

describe('CreateCheckRun', () => {
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

    it('sends POST to correct GitHub API URL', async () => {expect.hasAssertions();

        mockPost.mockResolvedValueOnce({
            data: { id: 1, html_url: 'https://github.com/owner/repo/checks/1' },
        });

        const result = await createCheckRun({
            name: 'Quality Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockPost).toHaveBeenCalledWith(
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
        expect(result).toStrictEqual({ id: 1, html_url: 'https://github.com/owner/repo/checks/1' });
    });

    it('includes output when provided', async () => {expect.hasAssertions();

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

        expect(mockPost).toHaveBeenCalledWith(
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

    it('includes details_url when provided', async () => {expect.hasAssertions();

        mockPost.mockResolvedValueOnce({
            data: { id: 3, html_url: '' },
        });

        await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
            detailsUrl: 'https://example.com/report',
        });

        expect(mockPost).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                details_url: 'https://example.com/report',
            }),
            expect.any(Object),
        );
    });

    it('returns null when GITHUB_TOKEN is missing', async () => {expect.hasAssertions();

        delete penv['GITHUB_TOKEN'];

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockPost).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('returns null when GITHUB_REPOSITORY is missing', async () => {expect.hasAssertions();

        delete penv['GITHUB_REPOSITORY'];

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockPost).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('returns null when GITHUB_SHA is missing', async () => {expect.hasAssertions();

        delete penv['GITHUB_SHA'];

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockPost).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('handles API error gracefully', async () => {expect.hasAssertions();

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

    it('handles network error gracefully', async () => {expect.hasAssertions();

        mockPost.mockRejectedValueOnce(new Error('Network error'));

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(result).toBeNull();
    });
});
