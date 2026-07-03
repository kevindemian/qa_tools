/**
 * Factory for creating properly typed FlatTest objects in tests.
 *
 * TypeScript cannot infer literal union types from ternary expressions
 * inside Array.from callbacks. This factory ensures correct typing.
 */
import type { FlatTest } from '../../result_parser.js';

export function createFlatTest(overrides?: Partial<FlatTest> & { state?: 'passed' | 'failed' | 'skipped' }): FlatTest {
    return {
        title: 'test',
        state: 'passed',
        duration: 0,
        ...overrides,
    };
}

export function createFlatTests(
    count: number,
    options?: {
        failFirst?: boolean;
        failCount?: number;
        duration?: number;
        titlePrefix?: string;
    },
): FlatTest[] {
    const { failFirst = false, failCount = failFirst ? 1 : 0, duration = 500, titlePrefix = 'test' } = options ?? {};
    return Array.from({ length: count }, (_, i) =>
        createFlatTest({
            title: `${titlePrefix}-${i}`,
            state: i < failCount ? 'failed' : 'passed',
            duration,
        }),
    );
}
