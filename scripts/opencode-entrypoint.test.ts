import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT_PATH = resolve(__dirname, '..', '.container', 'opencode-entrypoint.sh');

describe('opencode-entrypoint.sh', () => {
    it('exists', () => {
        expect(existsSync(ENTRYPOINT_PATH)).toBe(true);
    });

    it('has shebang', () => {
        const content = readFileSync(ENTRYPOINT_PATH, 'utf-8');
        expect(content.startsWith('#!/usr/bin/env bash')).toBe(true);
    });

    it('runs opencode at the end', () => {
        const content = readFileSync(ENTRYPOINT_PATH, 'utf-8');
        expect(content).toContain('exec opencode "$@"');
    });

    it('calls db maintenance', () => {
        const content = readFileSync(ENTRYPOINT_PATH, 'utf-8');
        expect(content).toContain('opencode-db-maintenance.ts');
    });

    it('checks for opencode before executing', () => {
        const content = readFileSync(ENTRYPOINT_PATH, 'utf-8');
        expect(content).toContain('command -v opencode');
    });

    it('is executable', () => {
        const mode = statSync(ENTRYPOINT_PATH).mode;
        expect(mode & 0o100).toBeTruthy();
    });
});
