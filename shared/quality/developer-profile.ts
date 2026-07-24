import { rootLogger } from '../logger.js';

export { generateDeveloperProfileHtml } from './developer-profile-renderer.js';

export interface AuthorStat {
    author: string;
    totalFailures: number;
    categories: Record<string, number>;
    testsTouched: number;
    failureRate: number;
    topFailureCategory: string;
}

export interface DeveloperProfileResult {
    authors: AuthorStat[];
    totalAuthors: number;
    totalFailures: number;
    topContributor: string;
    topFailureAuthor: string;
    timestamp: string;
}

function findTopCategory(categories: Record<string, number>): string {
    let topCategory = '';
    let topCount = 0;
    for (const [cat, count] of Object.entries(categories)) {
        if (count > topCount) {
            topCount = count;
            topCategory = cat;
        }
    }
    return topCategory;
}

function buildEmptyResult(): DeveloperProfileResult {
    return {
        authors: [],
        totalAuthors: 0,
        totalFailures: 0,
        topContributor: '',
        topFailureAuthor: '',
        timestamp: new Date().toISOString(),
    };
}

export function buildDeveloperProfile(
    failures:
        | Array<{
              testTitle: string;
              category: string;
              timestamp: string;
              author?: string;
          }>
        | null
        | undefined,
): DeveloperProfileResult {
    if (!failures) {
        return buildEmptyResult();
    }
    try {
        const authorMap = new Map<
            string,
            {
                totalFailures: number;
                categories: Record<string, number>;
                testsTouched: Set<string>;
            }
        >();

        for (const f of failures) {
            const author = f.author || 'Unknown';
            if (!authorMap.has(author)) {
                authorMap.set(author, { totalFailures: 0, categories: {}, testsTouched: new Set() });
            }
            const entry =
                authorMap.get(author) ??
                (() => {
                    throw new Error('author not found after set');
                })();
            entry.totalFailures++;
            entry.categories[f.category] = (entry.categories[f.category] ?? 0) + 1;
            entry.testsTouched.add(f.testTitle);
        }

        const authors: AuthorStat[] = [];
        let totalFailures = 0;
        let topContributor = '';
        let maxTestsTouched = 0;
        let topFailureAuthor = '';
        let maxFailures = 0;

        for (const [author, data] of authorMap) {
            const testsTouched = data.testsTouched.size;
            const failureRate = testsTouched > 0 ? (data.totalFailures / testsTouched) * 100 : 0;

            authors.push({
                author,
                totalFailures: data.totalFailures,
                categories: { ...data.categories },
                testsTouched,
                failureRate,
                topFailureCategory: findTopCategory(data.categories),
            });

            totalFailures += data.totalFailures;

            if (testsTouched > maxTestsTouched) {
                maxTestsTouched = testsTouched;
                topContributor = author;
            }

            if (data.totalFailures > maxFailures) {
                maxFailures = data.totalFailures;
                topFailureAuthor = author;
            }
        }

        return {
            authors,
            totalAuthors: authors.length,
            totalFailures,
            topContributor,
            topFailureAuthor,
            timestamp: new Date().toISOString(),
        };
    } catch (err) {
        const _msg = String(err);
        rootLogger.error('Failed to build developer profile: ' + _msg + '. Verify input data integrity and retry.');
        return buildEmptyResult();
    }
}
