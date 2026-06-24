import { buildDiffComparisonSection } from './report-diff.js';
import type { FlatTest } from './result_parser.js';

describe('BuildDiffComparisonSection', () => {
    it('returns empty when no changes', () => {
        const html = buildDiffComparisonSection({ newFailures: [], newPasses: [], flaky: [] });

        expect(html).toBe('');
    });

    it('renders new failures section', () => {
        const diff = {
            newFailures: [{ title: 'Login test', state: 'failed', duration: 100, error: 'Timeout' } as FlatTest],
            newPasses: [],
            flaky: [],
        };
        const html = buildDiffComparisonSection(diff);

        expect(html).toContain('Run Comparison');
        expect(html).toContain('Login test');
        expect(html).toContain('Timeout');
    });

    it('renders fixed tests section', () => {
        const diff = {
            newFailures: [],
            newPasses: [{ title: 'API test', state: 'passed', duration: 50 } as FlatTest],
            flaky: [],
        };
        const html = buildDiffComparisonSection(diff);

        expect(html).toContain('Fixed');
        expect(html).toContain('API test');
    });

    it('renders flaky tests section', () => {
        const diff = {
            newFailures: [],
            newPasses: [],
            flaky: [{ title: 'Flaky test', state: 'passed', duration: 100 } as FlatTest],
        };
        const html = buildDiffComparisonSection(diff);

        expect(html).toContain('Flaky');
        expect(html).toContain('Flaky test');
    });

    it('renders all sections together', () => {
        const diff = {
            newFailures: [{ title: 'F1', state: 'failed', duration: 100 } as FlatTest],
            newPasses: [{ title: 'P1', state: 'passed', duration: 50 } as FlatTest],
            flaky: [{ title: 'K1', state: 'passed', duration: 75 } as FlatTest],
        };
        const html = buildDiffComparisonSection(diff);

        expect(html).toContain('new failures');
        expect(html).toContain('fixed');
        expect(html).toContain('flaky');
    });
});
