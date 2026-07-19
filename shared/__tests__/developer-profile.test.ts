import { rootLogger } from '../logger.js';
import { buildDeveloperProfile, generateDeveloperProfileHtml } from '../quality/developer-profile.js';

vi.mock('../logger');

const mockRootLoggerError = vi.spyOn(rootLogger, 'error');

describe('Developer Profile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('BuildDeveloperProfile', () => {
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

            expect(alice).toMatchObject({
                totalFailures: 2,
                categories: { api: 1, ui: 1 },
                testsTouched: 2,
                failureRate: 100,
                topFailureCategory: 'api',
            });

            const bob = result.authors.find((a) => a.author === 'bob');

            expect(bob).toMatchObject({
                totalFailures: 1,
                categories: { api: 1 },
                testsTouched: 1,
                failureRate: 100,
            });
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

    describe('GenerateDeveloperProfileHtml', () => {
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

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain(':root{');
            expect(html).toContain('Developer Profile Dashboard');
            expect(html).toContain('Generated by QA Tools');
            expect(html).toContain('alice');
        });

        it('renders body content with author metrics for populated result', () => {
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

            expect(html).toContain('5');
            expect(html).toContain('166.7');
            expect(html).toContain('api');
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
            const html = generateDeveloperProfileHtml(result, 'Custom Title');

            expect(html).toContain('Custom Title');
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

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('No developer profile data available');
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

            expect(html).toContain('<!DOCTYPE html>');
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

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('alice');
            expect(html).toContain('bob');
        });

        it('logs error and returns error page on exception', () => {
            const html = generateDeveloperProfileHtml(null);

            expect(html).toContain('Error generating developer profile');
            expect(mockRootLoggerError).toHaveBeenCalledWith(
                expect.stringContaining('Failed to generate developer profile HTML:'),
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
            const html = generateDeveloperProfileHtml(result);

            expect(html).toContain('\u2014');
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

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('severity-critical');
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
            const html = generateDeveloperProfileHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('severity-high');
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
            const html = generateDeveloperProfileHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('severity-medium');
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
            const html = generateDeveloperProfileHtml(result);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('severity-low');
        });
    });

    describe('GenerateDeveloperProfileHtml — category breakdown', () => {
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
            const html = generateDeveloperProfileHtml(result);
            const apiIdx = html.indexOf('api');
            const uiIdx = html.indexOf('ui');

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
            const html = generateDeveloperProfileHtml(result);

            expect(html).toContain('No categories');
        });
    });
});
