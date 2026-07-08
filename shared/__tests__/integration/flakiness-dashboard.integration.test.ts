/**
 * Integration tests — Flakiness Dashboard (FT-19)
 *
 * Validates the Flakiness Dashboard HTML report end-to-end:
 * - generateFlakinessHtml with high flakiness entries
 * - All below threshold
 * - Error fallback
 * - Dark mode
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlakinessEntry } from '../../metrics.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

vi.mock('../../escape.js', () => ({
    sanitizeHtml: vi.fn((s: string) => s),
}));

function makeEntries(overrides?: Partial<FlakinessEntry>): FlakinessEntry[] {
    return [
        {
            title: overrides?.title ?? 'Login test',
            project: overrides?.project ?? 'test',
            passCount: overrides?.passCount ?? 5,
            failCount: overrides?.failCount ?? 5,
            skipCount: overrides?.skipCount ?? 0,
            totalRuns: overrides?.totalRuns ?? 10,
            rate: overrides?.rate ?? 0.5,
        },
    ];
}

describe('Integration: Flakiness Dashboard (FT-19)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-19a: generateFlakinessHtml with high flakiness', () => {
        it('produces complete HTML with summary and table', async () => {
            expect.hasAssertions();

            const { generateFlakinessHtml } = await import('../../flakiness-dashboard.js');
            const entries = makeEntries();
            const html = generateFlakinessHtml(entries, 'Flakiness Report');

            expect(html).toContain('Flakiness Report');
            expect(html).toContain('Login test');
            expect(html).toContain('50%');
            expect(html).toContain('data-component="badge"');
            expect(html).toContain('data-component="sparkline"');
        });
    });

    describe('FT-19b: all below threshold', () => {
        it('shows no-failure message when all entries below threshold', async () => {
            expect.hasAssertions();

            const { generateFlakinessHtml } = await import('../../flakiness-dashboard.js');
            const entries: FlakinessEntry[] = [
                {
                    title: 'Stable test',
                    project: 'test',
                    passCount: 99,
                    failCount: 1,
                    skipCount: 0,
                    totalRuns: 100,
                    rate: 0.01,
                },
            ];
            const html = generateFlakinessHtml(entries);

            expect(html).toContain('No tests exceed');
            expect(html).toContain('0');
        });
    });

    describe('FT-19c: custom title', () => {
        it('renders custom title in heading', async () => {
            expect.hasAssertions();

            const { generateFlakinessHtml } = await import('../../flakiness-dashboard.js');
            const html = generateFlakinessHtml([], 'My Dashboard');

            expect(html).toContain('My Dashboard');
        });
    });

    describe('FT-19e: dark mode', () => {
        it('includes theme toggle and dark mode CSS', async () => {
            expect.hasAssertions();

            const { generateFlakinessHtml } = await import('../../flakiness-dashboard.js');
            const html = generateFlakinessHtml([]);

            expect(html).toContain('qa-report-theme');
            expect(html).toContain('--color-surface-page');
            expect(html).toContain('html.dark');
        });
    });

    describe('FT-19d: error fallback', () => {
        it('returns error page when sanitizeHtml throws', async () => {
            expect.hasAssertions();

            const { sanitizeHtml } = await import('../../escape.js');
            const sanitizeMock = vi.mocked(sanitizeHtml);
            sanitizeMock.mockImplementationOnce(() => {
                throw new Error('simulated failure');
            });
            const { rootLogger } = await import('../../logger.js');
            const { generateFlakinessHtml } = await import('../../flakiness-dashboard.js');
            const html = generateFlakinessHtml([]);

            expect(html).toContain('Error generating dashboard');
            expect(rootLogger['error']).toHaveBeenCalledWith(
                expect.stringContaining('Failed to generate flakiness dashboard'),
            );
        });
    });

    describe('FT-19f: entries with extreme rate values', () => {
        it('handles NaN and Infinity rates without crashing', async () => {
            expect.hasAssertions();

            const { generateFlakinessHtml } = await import('../../flakiness-dashboard.js');
            const entries: FlakinessEntry[] = [
                {
                    title: 'NaN-test',
                    project: 'test',
                    passCount: 0,
                    failCount: 0,
                    skipCount: 0,
                    totalRuns: 1,
                    rate: NaN,
                },
                {
                    title: 'Inf-test',
                    project: 'test',
                    passCount: 0,
                    failCount: 10,
                    skipCount: 0,
                    totalRuns: 10,
                    rate: Infinity,
                },
                {
                    title: 'NegInf-test',
                    project: 'test',
                    passCount: 10,
                    failCount: 0,
                    skipCount: 0,
                    totalRuns: 10,
                    rate: -Infinity,
                },
            ];
            const html = generateFlakinessHtml(entries);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).not.toContain('NaN');
            expect(html).not.toContain('Infinity');
        });
    });
});
