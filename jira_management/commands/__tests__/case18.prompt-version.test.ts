import fs from 'fs';
import { describe, expect, it, vi } from 'vitest';
import { computePromptVersion, resolvePromptVersion } from '../case18.js';

describe('computePromptVersion (OPP-6)', () => {
    it('throws explicitly (not silent fallback) when the template cannot be read', () => {
        const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
            throw new Error('ENOENT: template missing');
        });
        try {
            expect(() => computePromptVersion()).toThrow(/template|ENOENT|read/i);
        } finally {
            readSpy.mockRestore();
        }
    });

    it('recovers instead of hard-failing: returns "unreadable" when the template cannot be read', () => {
        const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
            throw new Error('ENOENT: template missing');
        });
        try {
            expect(resolvePromptVersion()).toBe('unreadable');
        } finally {
            readSpy.mockRestore();
        }
    });

    it('returns a real version string when the template is readable', () => {
        expect(resolvePromptVersion()).toMatch(/^v[a-f0-9]{10}$/);
    });
});
