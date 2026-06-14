/**
 * Tests for github-pr-comment.ts.
 *
 * Tests use mocked axios to avoid real API calls.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { postPrComment } from './github-pr-comment.js';

const mockPost = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

// Axios mock
vi.mock('./deps.js', async () => {
    const actual = await vi.importActual('./deps.js');
    return {
        ...(actual as Record<string, unknown>),
        axios: {
            post: mockPost,
        },
    };
});

describe('postPrComment', () => {
    const originalEnv = { ...process.env };
    let penv = process.env as Record<string, string | undefined>;

    beforeEach(() => {
        penv = process.env;
        vi.clearAllMocks();
        penv['GITHUB_TOKEN'] = 'test-token';
        penv['GITHUB_REPOSITORY'] = 'owner/repo';
        penv['GITHUB_PR_NUMBER'] = '42';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('posts comment to correct GitHub API URL', async () => {
        mockPost.mockResolvedValueOnce({
            data: { id: 123, html_url: 'https://github.com/owner/repo/pull/42#issuecomment-123' },
        });

        const result = await postPrComment('Test comment body');

        expect(mockPost).toHaveBeenCalledWith(
            'https://api.github.com/repos/owner/repo/issues/42/comments',
            { body: 'Test comment body' },
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) as Record<string, unknown>,
            }),
        );
        expect(result).toEqual({
            id: 123,
            html_url: 'https://github.com/owner/repo/pull/42#issuecomment-123',
        });
    });

    it('returns null when GITHUB_TOKEN is missing', async () => {
        delete penv['GITHUB_TOKEN'];

        const result = await postPrComment('body');

        expect(mockPost).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('returns null when GITHUB_REPOSITORY is missing', async () => {
        delete penv['GITHUB_REPOSITORY'];

        const result = await postPrComment('body');

        expect(mockPost).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('returns null when PR number is missing', async () => {
        delete penv['GITHUB_PR_NUMBER'];

        const result = await postPrComment('body');

        expect(mockPost).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('uses explicit config over env vars', async () => {
        mockPost.mockResolvedValueOnce({
            data: { id: 456, html_url: 'https://github.com/custom/repo/pull/99#issuecomment-456' },
        });

        const result = await postPrComment('Custom body', {
            token: 'custom-token',
            repository: 'custom/repo',
            prNumber: 99,
        });

        expect(mockPost).toHaveBeenCalledWith(
            'https://api.github.com/repos/custom/repo/issues/99/comments',
            { body: 'Custom body' },
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer custom-token' }) as Record<string, unknown>,
            }),
        );
        expect(result).toEqual({
            id: 456,
            html_url: 'https://github.com/custom/repo/pull/99#issuecomment-456',
        });
    });

    it('handles API error gracefully', async () => {
        mockPost.mockRejectedValueOnce({
            response: { status: 403 },
            message: 'Forbidden',
        });

        const result = await postPrComment('body');

        expect(result).toBeNull();
    });

    it('handles network error without response', async () => {
        mockPost.mockRejectedValueOnce(new Error('Network error'));

        const result = await postPrComment('body');

        expect(result).toBeNull();
    });

    it('uses CI_PR_NUMBER fallback', async () => {
        delete penv['GITHUB_PR_NUMBER'];
        penv['CI_PR_NUMBER'] = '77';

        mockPost.mockResolvedValueOnce({
            data: { id: 789, html_url: 'https://github.com/owner/repo/pull/77#issuecomment-789' },
        });

        const result = await postPrComment('body');

        expect(mockPost).toHaveBeenCalledWith(
            expect.stringContaining('/issues/77/comments'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result?.id).toBe(789);
    });

    it('parses PR number from GITHUB_REF (github-actions fallback)', async () => {
        delete penv['GITHUB_PR_NUMBER'];
        delete penv['CI_PR_NUMBER'];
        penv['GITHUB_REF'] = 'refs/pull/123/merge';

        mockPost.mockResolvedValueOnce({
            data: { id: 999, html_url: 'https://github.com/owner/repo/pull/123#issuecomment-999' },
        });

        const result = await postPrComment('body');

        expect(mockPost).toHaveBeenCalledWith(
            expect.stringContaining('/issues/123/comments'),
            expect.any(Object),
            expect.any(Object),
        );
        expect(result?.id).toBe(999);
    });

    it('does not parse non-PR GITHUB_REF as number', async () => {
        delete penv['GITHUB_PR_NUMBER'];
        delete penv['CI_PR_NUMBER'];
        penv['GITHUB_REF'] = 'refs/heads/main';

        const result = await postPrComment('body');

        expect(mockPost).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('uses custom apiBaseUrl when provided', async () => {
        mockPost.mockResolvedValueOnce({
            data: { id: 111, html_url: 'https://ghe.example.com/repos/owner/repo/issues/42#issuecomment-111' },
        });

        const result = await postPrComment('body', {
            apiBaseUrl: 'https://ghe.example.com/api/v3',
        });

        expect(mockPost).toHaveBeenCalledWith(
            'https://ghe.example.com/api/v3/repos/owner/repo/issues/42/comments',
            expect.any(Object),
            expect.any(Object),
        );
        expect(result?.id).toBe(111);
    });
});
