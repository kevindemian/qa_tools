import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { detectFrameworkFromDeps, isManifestFile } from '../framework-detection.js';

describe('Framework-detection — property-based', () => {
    it('confidence always between 0 and 1', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.object({ maxKeys: 10, key: fc.string({ maxLength: 30 }), values: [fc.string({ maxLength: 10 })] }),
                (deps) => {
                    const result = detectFrameworkFromDeps(deps as Record<string, string>);
                    expect(result.confidence).toBeGreaterThanOrEqual(0);
                    expect(result.confidence).toBeLessThanOrEqual(1);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('isManifestFile always returns boolean', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 200 }), (path) => {
                const result = isManifestFile(path);
                expect(typeof result).toBe('boolean');
            }),
            { numRuns: 100 },
        );
    });

    it('empty deps returns unknown with confidence 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constant({}), (deps) => {
                const result = detectFrameworkFromDeps(deps);
                expect(result.framework).toBe('unknown');
                expect(result.confidence).toBe(0);
            }),
            { numRuns: 10 },
        );
    });

    it('known framework deps always return non-unknown', () => {
        expect.hasAssertions();

        const frameworks = [
            { key: 'vitest', name: 'vitest', conf: 0.9 },
            { key: 'jest', name: 'jest', conf: 0.9 },
            { key: 'mocha', name: 'mocha', conf: 0.8 },
            { key: 'cypress', name: 'cypress', conf: 0.95 },
            { key: 'playwright', name: 'playwright', conf: 0.95 },
            { key: 'pytest', name: 'pytest', conf: 0.8 },
        ];

        for (const fw of frameworks) {
            const deps = { [fw.key]: '1.0.0' };
            const result = detectFrameworkFromDeps(deps);
            expect(result.framework).toBe(fw.name);
            expect(result.confidence).toBe(fw.conf);
        }
    });
});
