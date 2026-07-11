/**
 * Unit tests — failure classifier (LA-1).
 * Verifies that check-run annotations are classified with level + line range,
 * including the warning-level expansion added in this phase.
 */
import { describe, it, expect } from 'vitest';
import { classifyFailures } from '../extractors/failure-classifier.js';
import type { CheckRunAnnotation } from '../extractors/failure-classifier.js';

describe('ClassifyFailures — annotations', () => {
    it('captures failure-level annotation with file, line, endLine and level', () => {
        expect.hasAssertions();

        const annotations: CheckRunAnnotation[] = [
            {
                path: 'src/a.ts',
                start_line: 10,
                end_line: 12,
                message: 'TypeError: cannot read property',
                annotation_level: 'failure',
            },
        ];
        const result = classifyFailures({ checkRunAnnotations: annotations });

        expect(result).toHaveLength(1);
        expect(result[0]?.file).toBe('src/a.ts');
        expect(result[0]?.line).toBe(10);
        expect(result[0]?.endLine).toBe(12);
        expect(result[0]?.level).toBe('failure');
        expect(result[0]?.message).toBe('TypeError: cannot read property');
    });

    it('captures warning-level annotation (LA-1 expansion)', () => {
        expect.hasAssertions();

        const annotations: CheckRunAnnotation[] = [
            {
                path: 'src/b.ts',
                start_line: 1,
                end_line: 3,
                message: 'flaky test detected',
                annotation_level: 'warning',
            },
        ];
        const result = classifyFailures({ checkRunAnnotations: annotations });

        expect(result).toHaveLength(1);
        expect(result[0]?.level).toBe('warning');
        expect(result[0]?.endLine).toBe(3);
    });

    it('falls back to log parsing when only logText is provided', () => {
        expect.hasAssertions();

        const result = classifyFailures({ logText: 'Error: connection reset by peer occurred during handshake' });

        expect(result.length).toBeGreaterThan(0);
        expect(result[0]?.message).toContain('connection reset');
    });
});
