/**
 * Failure classification — single source of truth.
 *
 * Categorizes test failure errors into named categories using regex matching.
 * Used by both DataHub compute (failure-classifications) and report renderers.
 */

const CLASSIFICATION_RULES: Array<{ pattern: RegExp; category: string }> = [
    { pattern: /TIMEOUT|TIMED OUT|30S|60S/, category: 'TIMEOUT' },
    { pattern: /ASSERT|EXPECTED|GOT |ACTUAL|TO BE /, category: 'ASSERTION' },
    { pattern: /CONNECT|DATABASE|NETWORK|REFUSED|ECONNREFUSED/, category: 'ENVIRONMENT' },
    { pattern: /NULL|UNDEFINED|CANNOT READ|TYPEERROR|REFERENCEERROR/, category: 'APPLICATION' },
    { pattern: /FLAKY|INTERMITTENT|RETRY/, category: 'FLAKY' },
];

export function classifyError(error: string): string {
    const upper = error.toUpperCase();
    for (const { pattern, category } of CLASSIFICATION_RULES) {
        if (pattern.test(upper)) return category;
    }
    return 'UNKNOWN';
}
