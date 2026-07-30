/**
 * Suite extraction — single source of truth.
 *
 * Extracts suite name from test title or fullTitle using ' > ' delimiter.
 * Used by both report renderers and DataHub compute (suite-breakdown).
 */

export function extractSuiteFromTitle(fullTitle: string): string {
    const parts = fullTitle.split(' > ');
    return parts.length > 1 ? parts.slice(0, -1).join(' > ') : '';
}
