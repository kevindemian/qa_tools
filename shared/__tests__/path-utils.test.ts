import { describe, expect, it } from 'vitest';
import { sanitizePath } from '../path-utils.js';

describe('Shared/path-utils', () => {
    describe('SanitizePath', () => {
        it('resolves a plain relative path against the base', () => {
            expect.hasAssertions();
            expect(sanitizePath('/base', 'file.txt')).toBe('/base/file.txt');
        });

        it('resolves a nested relative path against the base', () => {
            expect.hasAssertions();
            expect(sanitizePath('/base', 'a/b/c.txt')).toBe('/base/a/b/c.txt');
        });

        it('throws on parent traversal sequences', () => {
            expect.hasAssertions();
            expect(() => sanitizePath('/base', '../escape.txt')).toThrow(/Path traversal detected/);
        });

        it('throws on mid-path traversal sequences', () => {
            expect.hasAssertions();
            expect(() => sanitizePath('/base', 'a/../../b.txt')).toThrow(/Path traversal detected/);
        });

        it('allows a/../b because normalization removes the traversal (no escape)', () => {
            expect.hasAssertions();
            expect(sanitizePath('/base', 'a/../b')).toBe('/base/b');
        });
    });
});
