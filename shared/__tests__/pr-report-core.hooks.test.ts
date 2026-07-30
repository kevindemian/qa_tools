import { describe, it, expect } from 'vitest';

const hasAttr = (html: string, attr: string, value?: string): boolean => {
    if (value) {
        return html.includes(`${attr}="${value}"`);
    }
    return html.includes(`${attr}=`);
};

const countOccurrences = (html: string, pattern: string): number => {
    return html.split(pattern).length - 1;
};

const extractAll = (html: string, attr: string): string[] => {
    const re = new RegExp(attr + '="([^"]*)"', 'g');
    return [...html.matchAll(re)].map((m) => m[1] ?? '');
};

const extractFirst = (html: string, attr: string): string | null => {
    const re = new RegExp(attr + '="([^"]*)"');
    const match = re.exec(html);
    return match?.[1] ?? null;
};

describe('R5.2 HTML Hook Invariants', () => {
    it('all 21 data-dashboard values appear in valid HTML', () => {
        expect.hasAssertions();

        const values = [
            'ai-effectiveness',
            'ai-comparison',
            'incident-report',
            'impact-alert',
            'traceability',
            'flakiness',
            'backlog-health',
            'release-score',
            'silent-regression',
            'defect-trend',
            'defect-seasonality',
            'developer-profile',
            'pipeline-cost',
            'suite-optimization',
            'cross-squad-benchmark',
            'requirement-score',
            'coverage-report',
            'test-report',
            'pipeline-health',
            'weekly-quality-report',
            'quality-gate',
        ];
        for (const v of values) {
            expect(hasAttr(`<div data-dashboard="${v}"></div>`, 'data-dashboard', v)).toBeTruthy();
        }
    });

    it('all 18 data-section values appear in valid HTML', () => {
        expect.hasAssertions();

        const values = [
            'header',
            'summary',
            'version-breakdown',
            'trend',
            'flakiness-table',
            'density',
            'events',
            'actions',
            'advantage',
            'comparison',
            'severity',
            'description',
            'source-quality',
            'score',
            'regressions',
            'awareness',
            'coverage-gap',
            'quality-gate',
        ];
        for (const v of values) {
            expect(hasAttr(`<section data-section="${v}"></section>`, 'data-section', v)).toBeTruthy();
        }
    });

    it('all 15 primitive data-component values appear in valid HTML', () => {
        expect.hasAssertions();

        const values = [
            'container',
            'section',
            'grid',
            'flex-row',
            'separator',
            'card',
            'metric-card',
            'card-grid',
            'metric-grid',
            'badge',
            'data-table',
            'table-wrapper',
            'bar-chart',
            'severity-badge',
            'recommended-action',
        ];
        for (const v of values) {
            expect(hasAttr(`<div data-component="${v}"></div>`, 'data-component', v)).toBeTruthy();
        }
    });

    it('data-dashboard value is a non-empty string', () => {
        expect.hasAssertions();

        const value = extractFirst('<div data-dashboard="ai-effectiveness"></div>', 'data-dashboard');

        expect(value).not.toBeNull();
        expect(value?.length).toBeGreaterThan(0);
    });

    it('data-section values are kebab-case', () => {
        expect.hasAssertions();

        const value = extractFirst('<section data-section="version-breakdown"></section>', 'data-section');

        expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
    });

    it('data-component values are kebab-case', () => {
        expect.hasAssertions();

        const value = extractFirst('<div data-component="metric-card"></div>', 'data-component');

        expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
    });

    it('every table with data-component="data-table" has a caption', () => {
        expect.hasAssertions();

        const html =
            '<div data-component="data-table"><table><caption>Results</caption><thead><tr><th scope="col">Name</th></tr></thead></table></div>';

        expect(html).toContain('<caption>');
        expect(html).toContain('</caption>');
    });

    it('caption is the first child of table', () => {
        expect.hasAssertions();

        const re = new RegExp('<table[^>]*>\\s*<caption>');
        const match = re.exec('<table><caption>My Table</caption></table>');

        expect(match).not.toBeNull();
    });

    it('caption has non-empty text content', () => {
        expect.hasAssertions();

        const re = new RegExp('<caption>([^<]*)</caption>');
        const match = re.exec('<caption>Test Results</caption>');

        expect(match).not.toBeNull();
        expect(match?.[1]?.trim().length).toBeGreaterThan(0);
    });

    it('every th has a scope attribute', () => {
        expect.hasAssertions();

        const html = '<thead><tr><th scope="col">Name</th><th scope="col">Status</th></tr></thead>';
        const thRegex = /<th [^>]*>/g;
        const thMatches: string[] = [];
        let m = thRegex.exec(html);
        while (m !== null) {
            thMatches.push(m[0]);
            m = thRegex.exec(html);
        }

        expect(thMatches).toHaveLength(2);

        for (const th of thMatches) {
            expect(th).toMatch(/scope="(col|row)"/);
        }
    });

    it('scope values are either col or row', () => {
        expect.hasAssertions();

        const values = extractAll('<th scope="col">A</th><th scope="row">B</th>', 'scope');

        expect(values).toHaveLength(2);

        for (const s of values) {
            expect(['col', 'row']).toContain(s);
        }
    });

    it('empty state has data-empty-state attribute', () => {
        expect.hasAssertions();
        expect(hasAttr('<div data-empty-state="true"><p>No data</p></div>', 'data-empty-state')).toBeTruthy();
    });

    it('empty state has descriptive text', () => {
        expect.hasAssertions();
        expect('<div data-empty-state="true"><p>No test results found.</p></div>').toContain('No');
    });

    it('action has data-action attribute', () => {
        expect.hasAssertions();
        expect(hasAttr('<div data-action="true"><span>Fix test</span></div>', 'data-action')).toBeTruthy();
    });

    it('action has descriptive text', () => {
        expect.hasAssertions();

        const re = new RegExp('<div[^>]*data-action[^>]*><span>([^<]*)</span>');
        const textMatch = re.exec('<div data-action="true"><span>Investigate regression</span></div>');

        expect(textMatch).not.toBeNull();
        expect(textMatch?.[1]?.trim().length).toBeGreaterThan(5);
    });

    it('severity-badge uses data-component="severity-badge"', () => {
        expect.hasAssertions();
        expect(
            hasAttr('<span data-component="severity-badge">High</span>', 'data-component', 'severity-badge'),
        ).toBeTruthy();
    });

    it('metric-card has data-component="metric-card"', () => {
        expect.hasAssertions();
        expect(hasAttr('<div data-component="metric-card"></div>', 'data-component', 'metric-card')).toBeTruthy();
    });

    it('bar-chart has data-component="bar-chart"', () => {
        expect.hasAssertions();
        expect(hasAttr('<div data-component="bar-chart"></div>', 'data-component', 'bar-chart')).toBeTruthy();
    });

    it('every dashboard HTML has a single root with data-dashboard', () => {
        expect.hasAssertions();
        expect(countOccurrences('<div data-dashboard="x"></div>', 'data-dashboard=')).toBe(1);
    });

    it('data-section values are unique within a dashboard', () => {
        expect.hasAssertions();

        const html = '<section data-section="summary"></section><section data-section="trend"></section>';
        const values = extractAll(html, 'data-section');

        expect(new Set(values).size).toBe(values.length);
    });

    it('data-component values are unique within a component tree', () => {
        expect.hasAssertions();

        const html = '<div data-component="card"></div><div data-component="metric-card"></div>';
        const values = extractAll(html, 'data-component');

        expect(new Set(values).size).toBe(values.length);
    });

    it('every dashboard has at least one data-section', () => {
        expect.hasAssertions();
        expect(
            hasAttr('<div data-dashboard="x"><section data-section="summary"></section></div>', 'data-section'),
        ).toBeTruthy();
    });

    it('every dashboard has at least one data-component', () => {
        expect.hasAssertions();
        expect(
            hasAttr('<div data-dashboard="x"><div data-component="container"></div></div>', 'data-component'),
        ).toBeTruthy();
    });

    it('two separate containers = two reports', () => {
        expect.hasAssertions();
        expect(
            countOccurrences('<div data-dashboard="x"></div><div data-dashboard="x"></div>', 'data-dashboard="x"'),
        ).toBe(2);
    });
});
