/**
 * Unit tests — Fase 5 (055): canonical `--project`/`-p` parser (shared, reused by cli-args and jira main).
 */
import { describe, expect, it } from 'vitest';
import { parseProjectFlag } from '../parse-project-flag.js';

describe('Fase 5 — parseProjectFlag', () => {
    it('extrai --project', () => {
        expect.hasAssertions();
        expect(parseProjectFlag(['--project', 'demo'])).toBe('demo');
    });

    it('extrai -p (alias)', () => {
        expect.hasAssertions();
        expect(parseProjectFlag(['-p', 'demo', 'resto'])).toBe('demo');
    });

    it('ignora valor que parece flag', () => {
        expect.hasAssertions();
        expect(parseProjectFlag(['--project', '--batch'])).toBeUndefined();
    });

    it('retorna undefined sem flag', () => {
        expect.hasAssertions();
        expect(parseProjectFlag(['--batch', 'x'])).toBeUndefined();
    });

    it('retorna undefined para argv vazio', () => {
        expect.hasAssertions();
        expect(parseProjectFlag([])).toBeUndefined();
    });
});
