import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isTestArtifact, isCTRF, isJUnit, isMochawesome, parseArtifactBufferAll } from '../artifact-parser.js';

describe('Artifact-parser — property-based', () => {
    it('isTestArtifact always returns boolean', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 200 }), (name) => {
                const result = isTestArtifact(name);
                expect(typeof result).toBe('boolean');
            }),
            { numRuns: 100 },
        );
    });

    it('isCTRF returns false for non-JSON strings', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 500 }).filter((s) => !s.trimStart().startsWith('{')),
                (content) => {
                    expect(isCTRF(content)).toBe(false);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('isJUnit returns false for content without testsuite tags', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.string({ maxLength: 500 }).filter((s) => !s.includes('<testsuite') && !s.includes('<testsuites')),
                (content) => {
                    expect(isJUnit(content)).toBe(false);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('isMochawesome returns false for non-JSON strings', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 500 }).filter((s) => !s.trimStart().startsWith('{')),
                (content) => {
                    expect(isMochawesome(content)).toBe(false);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('parseArtifactBufferAll never throws on arbitrary buffers', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.uint8Array({ maxLength: 500 }),
                fc.constantFrom('test.json', 'results.xml', 'report.zip', 'unknown.txt'),
                (bytes, fileName) => {
                    const buffer = Buffer.from(bytes);
                    const result = parseArtifactBufferAll(buffer, fileName);
                    expect(Array.isArray(result)).toBe(true);
                },
            ),
            { numRuns: 50 },
        );
    });
});
