import { rootLogger } from './logger';
import { buildHtmlPage, buildErrorPage } from './html-factory';
import { buildDeveloperProfile, generateDeveloperProfileHtml } from './developer-profile';

jest.mock('./logger');
jest.mock('./html-factory');
jest.mock('./report-styles', () => ({ buildCss: () => ':root{}' }));
jest.mock('./escape', () => ({ sanitizeHtml: (s: string) => s }));
jest.mock('./primitives', () => ({
    Badge: ({ variant, children }: { variant?: string; children: string }) =>
        `<span class="badge-${variant}">${children}</span>`,
    MetricCard: ({ label, value }: { label: string; value: string }) =>
        `<div class="metric-card"><span class="label">${label}</span><span class="value">${value}</span></div>`,
    MetricGrid: ({ children }: { children: string }) => `<div class="metric-grid">${children}</div>`,
}));

const mockBuildHtmlPage = buildHtmlPage as jest.MockedFunction<typeof buildHtmlPage>;
const mockBuildErrorPage = buildErrorPage as jest.MockedFunction<typeof buildErrorPage>;
const mockRootLoggerError = rootLogger.error as jest.MockedFunction<typeof rootLogger.error>;

beforeEach(() => {
    jest.clearAllMocks();
    mockBuildHtmlPage.mockReturnValue('<html>mocked</html>');
    mockBuildErrorPage.mockReturnValue('<html>error</html>');
});

describe('buildDeveloperProfile', () => {
    it('returns empty result for empty input', () => {
        const result = buildDeveloperProfile([]);
        expect(typeof result.timestamp).toBe('string');
        expect(result).toMatchObject({
            authors: [],
            totalAuthors: 0,
            totalFailures: 0,
            topContributor: '',
            topFailureAuthor: '',
        });
    });

    it('groups failures by author', () => {
        const result = buildDeveloperProfile([
            { testTitle: 't1', category: 'api', timestamp: '2024-01-01', author: 'alice' },
            { testTitle: 't2', category: 'api', timestamp: '2024-01-01', author: 'bob' },
            { testTitle: 't3', category: 'ui', timestamp: '2024-01-01', author: 'alice' },
        ]);
        expect(result.totalAuthors).toBe(2);
        expect(result.totalFailures).toBe(3);
        expect(result.authors).toHaveLength(2);

        const alice = result.authors.find((a) => a.author === 'alice');
        expect(alice).toBeDefined();
        expect(alice?.totalFailures).toBe(2);
        expect(alice?.categories).toEqual({ api: 1, ui: 1 });
        expect(alice?.testsTouched).toBe(2);
        expect(alice?.failureRate).toBe(100);
        expect(alice?.topFailureCategory).toBe('api');

        const bob = result.authors.find((a) => a.author === 'bob');
        expect(bob).toBeDefined();
        expect(bob?.totalFailures).toBe(1);
        expect(bob?.categories).toEqual({ api: 1 });
        expect(bob?.testsTouched).toBe(1);
        expect(bob?.failureRate).toBe(100);
    });

    it('uses Unknown for missing author', () => {
        const result = buildDeveloperProfile([
            { testTitle: 't1', category: 'api', timestamp: '2024-01-01' },
            { testTitle: 't2', category: 'ui', timestamp: '2024-01-01' },
        ]);
        expect(result.totalAuthors).toBe(1);
        expect(result.authors[0]?.author).toBe('Unknown');
        expect(result.authors[0]?.totalFailures).toBe(2);
        expect(result.authors[0]?.testsTouched).toBe(2);
    });

    it('calculates failureRate correctly', () => {
        const result = buildDeveloperProfile([
            { testTitle: 't1', category: 'api', timestamp: '2024-01-01', author: 'alice' },
            { testTitle: 't1', category: 'api', timestamp: '2024-01-01', author: 'alice' },
            { testTitle: 't2', category: 'ui', timestamp: '2024-01-01', author: 'alice' },
        ]);
        expect(result.authors[0]?.totalFailures).toBe(3);
        expect(result.authors[0]?.testsTouched).toBe(2);
        expect(result.authors[0]?.failureRate).toBe(150);
    });

    it('calculates failureRate when same test fails multiple times', () => {
        const result = buildDeveloperProfile([
            { testTitle: 't1', category: 'api', timestamp: '2024-01-01', author: 'alice' },
            { testTitle: 't1', category: 'api', timestamp: '2024-01-01', author: 'alice' },
        ]);
        expect(result.authors[0]?.totalFailures).toBe(2);
        expect(result.authors[0]?.testsTouched).toBe(1);
        expect(result.authors[0]?.failureRate).toBe(200);
    });

    it('determines top contributor and top failure author', () => {
        const result = buildDeveloperProfile([
            { testTitle: 't1', category: 'a', timestamp: '', author: 'alice' },
            { testTitle: 't2', category: 'a', timestamp: '', author: 'alice' },
            { testTitle: 't3', category: 'a', timestamp: '', author: 'alice' },
            { testTitle: 't4', category: 'a', timestamp: '', author: 'bob' },
            { testTitle: 't5', category: 'a', timestamp: '', author: 'charlie' },
            { testTitle: 't5', category: 'a', timestamp: '', author: 'charlie' },
            { testTitle: 't5', category: 'a', timestamp: '', author: 'charlie' },
            { testTitle: 't5', category: 'a', timestamp: '', author: 'charlie' },
        ]);
        expect(result.topContributor).toBe('alice');
        expect(result.topFailureAuthor).toBe('charlie');
    });

    it('handles single author', () => {
        const result = buildDeveloperProfile([{ testTitle: 't1', category: 'db', timestamp: '', author: 'alice' }]);
        expect(result.totalAuthors).toBe(1);
        expect(result.topContributor).toBe('alice');
        expect(result.topFailureAuthor).toBe('alice');
    });

    it('picks top category by highest count', () => {
        const result = buildDeveloperProfile([
            { testTitle: 't1', category: 'api', timestamp: '', author: 'alice' },
            { testTitle: 't2', category: 'api', timestamp: '', author: 'alice' },
            { testTitle: 't3', category: 'ui', timestamp: '', author: 'alice' },
            { testTitle: 't4', category: 'db', timestamp: '', author: 'alice' },
        ]);
        expect(result.authors[0]?.topFailureCategory).toBe('api');
    });

    it('returns empty on null input', () => {
        const result = buildDeveloperProfile(null);
        expect(typeof result.timestamp).toBe('string');
        expect(result).toMatchObject({
            authors: [],
            totalAuthors: 0,
            totalFailures: 0,
            topContributor: '',
            topFailureAuthor: '',
        });
    });

    it('returns empty for empty array', () => {
        const result = buildDeveloperProfile([]);
        expect(result.authors).toHaveLength(0);
        expect(result.totalFailures).toBe(0);
    });
});

describe('generateDeveloperProfileHtml', () => {
    it('renders summary cards for populated result', () => {
        const result = {
            authors: [
                {
                    author: 'alice',
                    totalFailures: 5,
                    categories: { api: 3, ui: 2 },
                    testsTouched: 3,
                    failureRate: 166.67,
                    topFailureCategory: 'api',
                },
            ],
            totalAuthors: 1,
            totalFailures: 5,
            topContributor: 'alice',
            topFailureAuthor: 'alice',
            timestamp: '2024-01-01T00:00:00.000Z',
        };

        const html = generateDeveloperProfileHtml(result);
        expect(html).toBe('<html>mocked</html>');
        expect(mockBuildHtmlPage).toHaveBeenCalledTimes(1);
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        expect(call.title).toBe('Developer Profile Dashboard');
        expect(call.theme).toBe('system');
        expect(call.styles).toContain(':root{}');
        expect(call.footer).toContain('Developer Profile Dashboard');
        expect(call.bodyContent).toContain('alice');
        expect(call.bodyContent).toContain('5');
        expect(call.bodyContent).toContain('166.7');
        expect(call.bodyContent).toContain('api');
    });

    it('uses custom title', () => {
        const result = {
            authors: [],
            totalAuthors: 0,
            totalFailures: 0,
            topContributor: '',
            topFailureAuthor: '',
            timestamp: '',
        };
        generateDeveloperProfileHtml(result, 'Custom Title');
        expect(mockBuildHtmlPage.mock.calls[0]?.[0]?.title).toBe('Custom Title');
    });

    it('shows empty state when no authors', () => {
        const result = {
            authors: [],
            totalAuthors: 0,
            totalFailures: 0,
            topContributor: '',
            topFailureAuthor: '',
            timestamp: '2024-01-01T00:00:00.000Z',
        };
        const html = generateDeveloperProfileHtml(result);
        expect(html).toBe('<html>mocked</html>');
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        expect(call.bodyContent).toContain('No developer profile data available');
    });

    it('handles empty data gracefully', () => {
        const result = {
            authors: [],
            totalAuthors: 0,
            totalFailures: 0,
            topContributor: '',
            topFailureAuthor: '',
            timestamp: '',
        };
        const html = generateDeveloperProfileHtml(result);
        expect(html).toBe('<html>mocked</html>');
        expect(mockBuildHtmlPage).toHaveBeenCalledTimes(1);
    });

    it('renders multiple authors', () => {
        const result = {
            authors: [
                {
                    author: 'alice',
                    totalFailures: 3,
                    categories: { api: 3 },
                    testsTouched: 2,
                    failureRate: 150,
                    topFailureCategory: 'api',
                },
                {
                    author: 'bob',
                    totalFailures: 1,
                    categories: { ui: 1 },
                    testsTouched: 1,
                    failureRate: 100,
                    topFailureCategory: 'ui',
                },
            ],
            totalAuthors: 2,
            totalFailures: 4,
            topContributor: 'alice',
            topFailureAuthor: 'alice',
            timestamp: '',
        };
        const html = generateDeveloperProfileHtml(result);
        expect(html).toBe('<html>mocked</html>');
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        expect(call.bodyContent).toContain('alice');
        expect(call.bodyContent).toContain('bob');
    });

    it('logs error and returns error page on exception', () => {
        const html = generateDeveloperProfileHtml(null);
        expect(html).toBe('<html>error</html>');
        expect(mockRootLoggerError).toHaveBeenCalledWith(
            expect.stringContaining('Failed to generate developer profile HTML:'),
        );
        expect(mockBuildErrorPage).toHaveBeenCalledWith(
            'Error generating developer profile',
            'Error generating developer profile',
        );
    });

    it('uses dash for empty top contributor and top failure author', () => {
        const result = {
            authors: [],
            totalAuthors: 0,
            totalFailures: 0,
            topContributor: '',
            topFailureAuthor: '',
            timestamp: '',
        };
        generateDeveloperProfileHtml(result);
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        expect(call.bodyContent).toContain('\u2014');
    });
});

describe('AuthorStat failure rate severity classes', () => {
    it('renders critical severity for rate >= 50', () => {
        const result = {
            authors: [
                {
                    author: 'alice',
                    totalFailures: 10,
                    categories: { api: 10 },
                    testsTouched: 10,
                    failureRate: 50,
                    topFailureCategory: 'api',
                },
            ],
            totalAuthors: 1,
            totalFailures: 10,
            topContributor: 'alice',
            topFailureAuthor: 'alice',
            timestamp: '',
        };
        const html = generateDeveloperProfileHtml(result);
        expect(html).toBe('<html>mocked</html>');
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        expect(call.bodyContent).toContain('severity-critical');
    });

    it('renders high severity for rate >= 20 and < 50', () => {
        const result = {
            authors: [
                {
                    author: 'bob',
                    totalFailures: 3,
                    categories: { api: 3 },
                    testsTouched: 10,
                    failureRate: 30,
                    topFailureCategory: 'api',
                },
            ],
            totalAuthors: 1,
            totalFailures: 3,
            topContributor: 'bob',
            topFailureAuthor: 'bob',
            timestamp: '',
        };
        generateDeveloperProfileHtml(result);
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        expect(call.bodyContent).toContain('severity-high');
    });

    it('renders medium severity for rate >= 10 and < 20', () => {
        const result = {
            authors: [
                {
                    author: 'carol',
                    totalFailures: 1,
                    categories: { db: 1 },
                    testsTouched: 10,
                    failureRate: 10,
                    topFailureCategory: 'db',
                },
            ],
            totalAuthors: 1,
            totalFailures: 1,
            topContributor: 'carol',
            topFailureAuthor: 'carol',
            timestamp: '',
        };
        generateDeveloperProfileHtml(result);
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        expect(call.bodyContent).toContain('severity-medium');
    });

    it('renders low severity for rate < 10', () => {
        const result = {
            authors: [
                {
                    author: 'dave',
                    totalFailures: 1,
                    categories: { api: 1 },
                    testsTouched: 20,
                    failureRate: 5,
                    topFailureCategory: 'api',
                },
            ],
            totalAuthors: 1,
            totalFailures: 1,
            topContributor: 'dave',
            topFailureAuthor: 'dave',
            timestamp: '',
        };
        generateDeveloperProfileHtml(result);
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        expect(call.bodyContent).toContain('severity-low');
    });
});

describe('generateDeveloperProfileHtml — category breakdown', () => {
    it('shows category table with entries sorted by count descending', () => {
        const result = {
            authors: [
                {
                    author: 'alice',
                    totalFailures: 5,
                    categories: { ui: 2, api: 3 },
                    testsTouched: 4,
                    failureRate: 125,
                    topFailureCategory: 'api',
                },
            ],
            totalAuthors: 1,
            totalFailures: 5,
            topContributor: 'alice',
            topFailureAuthor: 'alice',
            timestamp: '',
        };
        generateDeveloperProfileHtml(result);
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        const body = call.bodyContent;
        const apiIdx = body.indexOf('api');
        const uiIdx = body.indexOf('ui');
        expect(apiIdx).toBeLessThan(uiIdx);
    });

    it('shows no categories message when categories empty', () => {
        const result = {
            authors: [
                {
                    author: 'alice',
                    totalFailures: 0,
                    categories: {},
                    testsTouched: 0,
                    failureRate: 0,
                    topFailureCategory: '',
                },
            ],
            totalAuthors: 1,
            totalFailures: 0,
            topContributor: 'alice',
            topFailureAuthor: 'alice',
            timestamp: '',
        };
        generateDeveloperProfileHtml(result);
        const call = mockBuildHtmlPage.mock.calls[0]?.[0];
        if (!call) throw new Error('mock not called');
        expect(call.bodyContent).toContain('No categories');
    });
});
