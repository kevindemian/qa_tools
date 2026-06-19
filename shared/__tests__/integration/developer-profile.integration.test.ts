/**
 * Integration tests — Developer Profile (FT-27)
 *
 * Validates the Developer Profile HTML report end-to-end:
 * - generateDeveloperProfileHtml with varying profiles
 * - Empty state
 * - Error fallback (null/undefined result)
 * - Custom title
 * - Custom title
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeveloperProfileResult } from '../../developer-profile.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

function makeResult(overrides?: Partial<DeveloperProfileResult>): DeveloperProfileResult {
    return {
        authors: [
            {
                author: 'alice',
                totalFailures: 5,
                categories: { api: 3, ui: 2 },
                testsTouched: 3,
                failureRate: 166.67,
                topFailureCategory: 'api',
            },
            {
                author: 'bob',
                totalFailures: 2,
                categories: { db: 2 },
                testsTouched: 2,
                failureRate: 100,
                topFailureCategory: 'db',
            },
        ],
        totalAuthors: 2,
        totalFailures: 7,
        topContributor: 'alice',
        topFailureAuthor: 'alice',
        timestamp: '2026-06-16T00:00:00.000Z',
        ...overrides,
    };
}

describe('Integration: Developer Profile (FT-27)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-27a: generateDeveloperProfileHtml with data', () => {
        it('produces complete HTML with summary and author sections', async () => {
            const { generateDeveloperProfileHtml } = await import('../../developer-profile.js');
            const result = makeResult();
            const html = generateDeveloperProfileHtml(result, 'Developer Report');
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Developer Report');
            expect(html).toContain('alice');
            expect(html).toContain('bob');
            expect(html).toContain('Total Authors');
            expect(html).toContain('Total Failures');
            expect(html).toContain('7');
            expect(html).toContain('qa-report-theme');
        });
    });

    describe('FT-27b: empty authors list', () => {
        it('shows no-data message', async () => {
            const { generateDeveloperProfileHtml } = await import('../../developer-profile.js');
            const result = makeResult({
                authors: [],
                totalAuthors: 0,
                totalFailures: 0,
                topContributor: '',
                topFailureAuthor: '',
            });
            const html = generateDeveloperProfileHtml(result);
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('No developer profile data available');
            expect(html).toContain('0');
        });
    });

    describe('FT-27c: error fallback for null result', () => {
        it('returns error page for null result', async () => {
            const { generateDeveloperProfileHtml } = await import('../../developer-profile.js');
            const html = generateDeveloperProfileHtml(null);
            expect(html).toContain('Error generating developer profile');
            expect(html).toContain('qa-report-theme');
        });

        it('returns error page for undefined result', async () => {
            const { generateDeveloperProfileHtml } = await import('../../developer-profile.js');
            const html = generateDeveloperProfileHtml(undefined);
            expect(html).toContain('Error generating developer profile');
        });
    });

    describe('FT-27d: custom title', () => {
        it('uses custom title in HTML page', async () => {
            const { generateDeveloperProfileHtml } = await import('../../developer-profile.js');
            const result = makeResult({
                authors: [],
                totalAuthors: 0,
                totalFailures: 0,
                topContributor: '',
                topFailureAuthor: '',
            });
            const html = generateDeveloperProfileHtml(result, 'My Custom Title');
            expect(html).toContain('My Custom Title');
        });
    });
});
