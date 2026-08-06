import {
    isGitHubCi,
    isGitLabCi,
    buildGitTrendHtml,
    buildJiraContextHtml,
    injectAnalysisSection,
    buildDiffSummary,
    isValidCtrfData,
    parseCliExtra,
} from '../case17-helpers.js';
import type { MetricsRun, FlakinessEntry } from '../../../shared/types/data-hub.js';
import { containsEmoji } from '../../../shared/test-utils/assertions.js';

const makeFlakyEntry = (title: string, passCount: number, failCount: number): FlakinessEntry => ({
    title,
    project: 'test-project',
    passCount,
    failCount,
    skipCount: 0,
    totalRuns: passCount + failCount,
    rate: failCount > 0 ? failCount / (passCount + failCount) : 0,
});

const expectOnlyBarDataStyles = (html: string): void => {
    for (const styleAttr of html.match(/style="[^"]*"/g) ?? []) {
        const declarations = styleAttr
            .slice('style="'.length, -1)
            .split(';')
            .filter((d) => d.trim().length > 0);
        for (const declaration of declarations) {
            expect(declaration).toMatch(/^--bar-[^:]+:[^;]+$/);
        }
    }
};

describe('IsGitHubCi', () => {
    const OGT = process.env['GITHUB_TOKEN'];
    const OGR = process.env['GITHUB_REPOSITORY'];

    afterEach(() => {
        process.env['GITHUB_TOKEN'] = OGT;
        process.env['GITHUB_REPOSITORY'] = OGR;
    });

    it('returns true when both env vars are set', () => {
        process.env['GITHUB_TOKEN'] = 'token';
        process.env['GITHUB_REPOSITORY'] = 'owner/repo';

        expect(isGitHubCi()).toBeTruthy();
    });

    it('returns false when GITHUB_TOKEN missing', () => {
        delete process.env['GITHUB_TOKEN'];
        process.env['GITHUB_REPOSITORY'] = 'owner/repo';

        expect(isGitHubCi()).toBeFalsy();
    });

    it('returns false when GITHUB_REPOSITORY missing', () => {
        process.env['GITHUB_TOKEN'] = 'token';
        delete process.env['GITHUB_REPOSITORY'];

        expect(isGitHubCi()).toBeFalsy();
    });
});

describe('IsGitLabCi', () => {
    const OGT = process.env['CI_JOB_TOKEN'];
    const OGP = process.env['CI_PROJECT_ID'];

    afterEach(() => {
        process.env['CI_JOB_TOKEN'] = OGT;
        process.env['CI_PROJECT_ID'] = OGP;
    });

    it('returns true when both env vars are set', () => {
        process.env['CI_JOB_TOKEN'] = 'token';
        process.env['CI_PROJECT_ID'] = '123';

        expect(isGitLabCi()).toBeTruthy();
    });

    it('returns false when CI_JOB_TOKEN missing', () => {
        delete process.env['CI_JOB_TOKEN'];
        process.env['CI_PROJECT_ID'] = '123';

        expect(isGitLabCi()).toBeFalsy();
    });

    it('returns false when CI_PROJECT_ID missing', () => {
        process.env['CI_JOB_TOKEN'] = 'token';
        delete process.env['CI_PROJECT_ID'];

        expect(isGitLabCi()).toBeFalsy();
    });
});

describe('BuildGitTrendHtml', () => {
    const makeRun = (failed: boolean): MetricsRun => ({
        timestamp: '2024-01-15T00:00:00Z',
        project: 'test-project',
        passed: failed ? 9 : 10,
        failed: failed ? 1 : 0,
        skipped: 0,
        total: 10,
        duration: 1000,
        tests: [{ title: 'Flaky Test', state: failed ? 'failed' : 'passed', duration: 100 }],
    });

    it('returns empty string when CI context is empty', () => {
        expect(buildGitTrendHtml('', [], [])).toBe('');
    });

    it('returns HTML with run bars when runs are present', () => {
        const html = buildGitTrendHtml('', [makeRun(false)], []);

        expect(html).toContain('Git Pipeline Context');
        expect(html).toContain('100.0%');
    });

    it('includes flaky tests section with structured table from computed entries', () => {
        const flakyEntries: FlakinessEntry[] = [makeFlakyEntry('Flaky Test', 3, 3)];
        const html = buildGitTrendHtml('', [makeRun(true)], flakyEntries);

        expect(html).toContain('Flaky Tests');
        expect(html).toContain('Flaky Test');
        expect(html).toContain('50.0%');
    });

    it('includes commits section', () => {
        const html = buildGitTrendHtml('- fix login (user, 2024-01-15)', [], []);

        expect(html).toContain('Recent Commits');
        expect(html).toContain('fix login');
    });

    it('renders no emojis and no color/border inline styles (B15)', () => {
        expect.hasAssertions();

        const flakyEntries: FlakinessEntry[] = [makeFlakyEntry('Flaky Test', 3, 3)];
        const html = buildGitTrendHtml('- fix login (user, 2024-01-15)', [makeRun(true)], flakyEntries);

        expect(containsEmoji(html)).toBeFalsy();

        expectOnlyBarDataStyles(html);

        expect(html).toContain('case17-');
    });
});

describe('BuildJiraContextHtml', () => {
    it('returns empty string for empty context', () => {
        expect(buildJiraContextHtml('')).toBe('');
    });

    it('returns HTML with issues when context is present', () => {
        const html = buildJiraContextHtml('- BUG-1 (Open): Login fails\n');

        expect(html).toContain('Related Jira Issues');
        expect(html).toContain('BUG-1');
    });
});

describe('InjectAnalysisSection', () => {
    it('injects analysis before </body>', () => {
        const result = injectAnalysisSection('<html><body>content</body></html>', 'Analysis text');

        expect(result).toContain('Failure Analysis');
        expect(result).toContain('Analysis text');
        expect(result).toContain('<html><body>content');
    });

    it('returns original HTML when no </body> tag', () => {
        const html = '<html><div>no body</div></html>';

        expect(injectAnalysisSection(html, 'text')).toBe(html);
    });
});

describe('BuildDiffSummary', () => {
    it('returns empty string when no changes', () => {
        expect(buildDiffSummary({ newFailures: [], newPasses: [], flaky: [] })).toBe('');
    });

    it('includes new failures', () => {
        expect.hasAssertions();

        const html = buildDiffSummary({
            newFailures: [{ title: 'Fail A', state: 'failed', duration: 100, error: 'timeout' }],
            newPasses: [],
            flaky: [],
        });

        expect(html).toContain('new failure');
        expect(html).toContain('Fail A');
        expect(containsEmoji(html)).toBeFalsy();

        expectOnlyBarDataStyles(html);
    });

    it('includes new passes', () => {
        const html = buildDiffSummary({
            newFailures: [],
            newPasses: [{ title: 'Pass B', state: 'passed', duration: 50 }],
            flaky: [],
        });

        expect(html).toContain('new pass');
    });

    it('truncates long failure lists', () => {
        const failures = Array.from({ length: 7 }, (_, i) => ({
            title: `Fail ${i}`,
            state: 'failed' as const,
            duration: 100,
            error: 'err',
        }));
        const html = buildDiffSummary({ newFailures: failures, newPasses: [], flaky: [] });

        expect(html).toContain('e mais 2');
    });
});

describe('IsValidCtrfData', () => {
    it('returns true for valid data', () => {
        const data = { results: { tests: [{ name: 'T1', status: 'passed' }] } };

        expect(isValidCtrfData(data)).toBeTruthy();
    });

    it('returns false for null', () => {
        expect(isValidCtrfData(null)).toBeFalsy();
    });

    it('returns false for non-object', () => {
        expect(isValidCtrfData('string')).toBeFalsy();
    });

    it('returns false when results missing', () => {
        expect(isValidCtrfData({})).toBeFalsy();
    });

    it('returns false when tests missing', () => {
        expect(isValidCtrfData({ results: {} })).toBeFalsy();
    });
});

describe('ParseCliExtra', () => {
    const origArgv = process.argv;

    afterEach(() => {
        process.argv = origArgv;
    });

    it('parses --publish flag', () => {
        process.argv = ['node', 'script', '--publish', 's3'];

        expect(parseCliExtra().publishTarget).toBe('s3');
    });

    it('parses --run flag', () => {
        process.argv = ['node', 'script', '--run', 'chrome=results.json'];
        const result = parseCliExtra();

        expect(result.extraRuns).toHaveLength(1);
        expect(result.extraRuns[0]).toStrictEqual({ name: 'chrome', file: 'results.json' });
    });

    it('does not treat a plain --run value as a publish target', () => {
        process.argv = ['node', 'script', '--run', 'chrome=results.json'];

        expect(parseCliExtra().publishTarget).toBeUndefined();
    });

    it('parses --publish not in first position (flag order independent)', () => {
        process.argv = ['node', 'script', '--run', 'chrome=results.json', '--publish', 's3'];

        expect(parseCliExtra().publishTarget).toBe('s3');
    });

    it('parses --run not in first position (flag order independent)', () => {
        process.argv = ['node', 'script', '--publish', 's3', '--run', 'chrome=results.json'];
        const result = parseCliExtra();

        expect(result.publishTarget).toBe('s3');
        expect(result.extraRuns).toHaveLength(1);
        expect(result.extraRuns[0]).toStrictEqual({ name: 'chrome', file: 'results.json' });
    });

    it('skips empty --publish value', () => {
        process.argv = ['node', 'script', '--publish', ''];

        expect(parseCliExtra().publishTarget).toBeUndefined();
    });

    it('skips malformed --run value', () => {
        process.argv = ['node', 'script', '--run', '=onlyfile', '--run', 'name='];
        const result = parseCliExtra();

        expect(result.extraRuns).toHaveLength(0);
    });

    it('returns empty result for no args', () => {
        process.argv = ['node', 'script'];
        const result = parseCliExtra();

        expect(result.publishTarget).toBeUndefined();
        expect(result.extraRuns).toHaveLength(0);
    });
});

describe('Case17Helpers — exact rendered markup (mutation coverage)', () => {
    const makeRun = (timestamp: string, passed: number, failed: number): MetricsRun => ({
        timestamp,
        project: 'test-project',
        passed,
        failed,
        skipped: 0,
        total: passed + failed,
        duration: 1000,
        tests: [],
    });

    it('renders the runs-chart scaffolding with bar columns', () => {
        const html = buildGitTrendHtml(
            '',
            [makeRun('2024-01-15T00:00:00Z', 10, 0), makeRun('2024-02-20T00:00:00Z', 5, 5)],
            [],
        );

        expect(html).toContain('<div class="runs-chart">');
        expect(html).toContain('<div class="runs-chart-label">Pass Rate — Last 2 Runs</div>');
        expect(html).toContain('<div class="runs-chart-bars">');
        expect(html).toContain('<div class="runs-chart-col">');
        expect(html).toContain('<div class="runs-chart-bar" style="--bar-h:');
        expect(html).toContain('px;--bar-color:');
        expect(html).toContain('data-icon="trending-up"');
    });

    it('renders per-run titles with rate and date', () => {
        const html = buildGitTrendHtml(
            '',
            [makeRun('2024-01-15T00:00:00Z', 10, 0), makeRun('2024-02-20T00:00:00Z', 5, 5)],
            [],
        );

        expect(html).toContain('" title="Run 1: 100.0% (10/10)"');
        expect(html).toContain('" title="Run 2: 50.0% (5/10)"');
        expect(html).toContain('<span class="runs-chart-date">');
    });

    it('renders the flaky-tests table container and headers', () => {
        const html = buildGitTrendHtml('', [], [makeFlakyEntry('Flaky Test', 3, 3)]);

        expect(html).toContain('<div class="chart-box case17-box">');
        expect(html).toContain('<div class="label case17-label">');
        expect(html).toContain(' Git Pipeline Context</div>');
        expect(html).toContain('<table class="case17-table">');
        expect(html).toContain('<th class="case17-th">Test</th>');
        expect(html).toContain('<th class="case17-th case17-th-right">Passes</th>');
        expect(html).toContain('<th class="case17-th case17-th-right">Failures</th>');
        expect(html).toContain('<th class="case17-th case17-th-right">Rate</th>');
    });

    it('renders the flaky-tests row and details markup', () => {
        const html = buildGitTrendHtml('', [], [makeFlakyEntry('Flaky Test', 3, 3)]);

        expect(html).toContain('<td class="case17-td">');
        expect(html).toContain(
            '<tr><td class="case17-td">Flaky Test</td><td class="case17-td case17-td-right">3</td><td class="case17-td case17-td-right">3</td><td class="case17-td case17-td-right">50.0%</td></tr>',
        );
        expect(html).toContain('<details class="case17-details">');
        expect(html).toContain('<summary class="case17-summary case17-summary-flaky">');
        expect(html).toContain('data-icon="alert-triangle"');
    });

    it('renders the commits details markup', () => {
        const html = buildGitTrendHtml('- fix login (user, 2024-01-15)', [], []);

        expect(html).toContain('<details class="case17-details case17-details-commits">');
        expect(html).toContain('<summary class="case17-summary case17-summary-commits">');
        expect(html).toContain('data-icon="file-text"');
        expect(html).toContain('<pre class="case17-pre">');
    });

    it('renders the jira context box markup', () => {
        const html = buildJiraContextHtml('- BUG-1 (Open): Login fails\n');

        expect(html).toContain('<div class="chart-box case17-box-jira">');
        expect(html).toContain('<div class="label case17-label">');
        expect(html).toContain(' Related Jira Issues</div>');
        expect(html).toContain('data-icon="link"');
        expect(html).toContain('<pre class="case17-pre-flat">');
        expect(html).toContain('Login fails\n</pre></div>');
    });

    it('escapes < in jira context before rendering', () => {
        const html = buildJiraContextHtml('- BUG-1: check a < b\n');

        expect(html).toContain('- BUG-1: check a &lt; b');
        expect(html).not.toContain('- BUG-1: check a < b');
    });

    it('injects the analysis section before </body> with escaped content', () => {
        const result = injectAnalysisSection('<html><body>content</body></html>', 'A<B');

        expect(result).toContain(
            '<div class="chart-box"><h2>Failure Analysis</h2><pre class="case17-pre-flat">A&lt;B</pre></div></body>',
        );
    });

    it('renders the diff summary failures markup', () => {
        const html = buildDiffSummary({
            newFailures: [{ title: 'Fail A', state: 'failed', duration: 100, error: 'timeout' }],
            newPasses: [{ title: 'Pass B', state: 'passed', duration: 50 }],
            flaky: [],
        });

        expect(html).toContain('<div class="chart-box case17-box">');
        expect(html).toContain('<div class="label case17-label">');
        expect(html).toContain('data-icon="bar-chart"');
        expect(html).toContain(' Differential vs Last Run</div>');
        expect(html).toContain('<p class="case17-diff-fail">');
        expect(html).toContain('data-icon="x-circle"');
        expect(html).toContain(' <b>');
        expect(html).toContain('<b>1 new failure(s):</b></p>');
    });

    it('renders the diff summary passes markup', () => {
        const html = buildDiffSummary({
            newFailures: [{ title: 'Fail A', state: 'failed', duration: 100, error: 'timeout' }],
            newPasses: [{ title: 'Pass B', state: 'passed', duration: 50 }],
            flaky: [],
        });

        expect(html).toContain('<p class="case17-diff-pass">');
        expect(html).toContain('data-icon="check-circle"');
        expect(html).toContain(' <b>');
        expect(html).toContain('<b>1 new pass(es):</b>');
    });
});
