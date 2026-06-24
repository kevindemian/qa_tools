import {
    isGitHubCi,
    isGitLabCi,
    buildGitTrendHtml,
    buildJiraContextHtml,
    injectAnalysisSection,
    buildDiffSummary,
    isValidCtrfData,
    parseCliExtra,
} from './case17-helpers.js';

describe('isGitHubCi', () => {
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

describe('isGitLabCi', () => {
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

describe('buildGitTrendHtml', () => {
    it('returns empty string when CI context is empty', () => {
        expect(buildGitTrendHtml({ commits: '', runs: [], flakyTests: '' })).toBe('');
    });

    it('returns HTML with run bars when runs are present', () => {
        const html = buildGitTrendHtml({
            commits: '',
            runs: [
                {
                    runId: 1,
                    createdAt: '2024-01-15T00:00:00Z',
                    passed: 10,
                    failed: 0,
                    skipped: 0,
                    total: 10,
                    passRate: 100,
                },
            ],
            flakyTests: '',
        });

        expect(html).toContain('Git Pipeline Context');
        expect(html).toContain('100.0%');
    });

    it('includes flaky tests section', () => {
        const html = buildGitTrendHtml({
            commits: '',
            runs: [],
            flakyTests: '- Test A: passed, failed\n',
        });

        expect(html).toContain('Flaky Tests');
        expect(html).toContain('Test A');
    });

    it('includes commits section', () => {
        const html = buildGitTrendHtml({
            commits: '- fix login (user, 2024-01-15)',
            runs: [],
            flakyTests: '',
        });

        expect(html).toContain('Recent Commits');
        expect(html).toContain('fix login');
    });
});

describe('buildJiraContextHtml', () => {
    it('returns empty string for empty context', () => {
        expect(buildJiraContextHtml('')).toBe('');
    });

    it('returns HTML with issues when context is present', () => {
        const html = buildJiraContextHtml('- BUG-1 (Open): Login fails\n');

        expect(html).toContain('Related Jira Issues');
        expect(html).toContain('BUG-1');
    });
});

describe('injectAnalysisSection', () => {
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

describe('buildDiffSummary', () => {
    it('returns empty string when no changes', () => {
        expect(buildDiffSummary({ newFailures: [], newPasses: [], flaky: [] })).toBe('');
    });

    it('includes new failures', () => {
        const html = buildDiffSummary({
            newFailures: [{ title: 'Fail A', state: 'failed', duration: 100, error: 'timeout' }],
            newPasses: [],
            flaky: [],
        });

        expect(html).toContain('new failure');
        expect(html).toContain('Fail A');
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

describe('isValidCtrfData', () => {
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

describe('parseCliExtra', () => {
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
        expect(result.extraRuns[0]).toEqual({ name: 'chrome', file: 'results.json' });
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
