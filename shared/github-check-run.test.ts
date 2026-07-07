/**
 * Tests for github-check-run.ts.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createCheckRun } from './github-check-run.js';

const mockPost = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock('./deps.js', async () => {
    const actual = await vi.importActual('./deps.js');
    return {
        ...(actual as object),
        axios: {
            post: mockPost,
        },
    };
});

describe('CreateCheckRun', () => {
    const originalEnv = { ...process.env };
    const penv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        penv['GITHUB_TOKEN'] = 'test-token';
        penv['GITHUB_REPOSITORY'] = 'owner/repo';
        penv['GITHUB_SHA'] = 'abc123def456';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
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

    it('returns null when GITHUB_TOKEN is missing', async () => {
        expect.assertions(2);

        delete penv['GITHUB_TOKEN'];

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockPost).toHaveBeenCalledTimes(0);
        expect(result).toBeNull();
    });

    it('returns null when GITHUB_REPOSITORY is missing', async () => {
        expect.assertions(2);

        delete penv['GITHUB_REPOSITORY'];

        const result = await createCheckRun({
            name: 'Gate',
            status: 'completed',
            conclusion: 'success',
        });

        expect(mockPost).toHaveBeenCalledTimes(0);
        expect(result).toBeNull();
    });

    it('returns null when GITHUB_SHA is missing', async () => {
        expect.assertions(2);

        delete penv['GITHUB_SHA'];

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
