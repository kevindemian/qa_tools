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

function makeEntries(overrides?: Partial<FlakinessEntry>): FlakinessEntry[] {
    return [
        {
            title: 'Login test',
            passCount: 5,
            failCount: 5,
            skipCount: 0,
            totalRuns: 10,
            rate: 0.5,
            ...overrides,
        },
    ];
}

describe('Integration: Flakiness Dashboard (FT-19)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-19a: generateFlakinessHtml with high flakiness', () => {
        it('produces complete HTML with summary and table', async () => {
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
            const { generateFlakinessHtml } = await import('../../flakiness-dashboard.js');
            const entries: FlakinessEntry[] = [
                { title: 'Stable test', passCount: 99, failCount: 1, skipCount: 0, totalRuns: 100, rate: 0.01 },
            ];
            const html = generateFlakinessHtml(entries);
            expect(html).toContain('No tests exceed');
            expect(html).toContain('0');
        });
    });

    describe('FT-19c: custom title', () => {
        it('renders custom title in heading', async () => {
            const { generateFlakinessHtml } = await import('../../flakiness-dashboard.js');
            const html = generateFlakinessHtml([], 'My Dashboard');
            expect(html).toContain('My Dashboard');
        });
    });

    describe('FT-19e: dark mode', () => {
        it('includes theme toggle and dark mode CSS', async () => {
            const { generateFlakinessHtml } = await import('../../flakiness-dashboard.js');
            const html = generateFlakinessHtml([]);
            expect(html).toContain('qa-report-theme');
            expect(html).toContain('--color-surface-page');
            expect(html).toContain('html.dark');
        });
    });
});
