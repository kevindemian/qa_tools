import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyProjectEnvOverlay, __resetDotenvLoaded } from '../env-loader.js';
import { projectEnvPath } from '../project-registry.js';

describe('Env-loader — per-project overlay', () => {
    let TMP: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'env-loader-overlay-'));
        process.env['XDG_CONFIG_HOME'] = TMP;
        __resetDotenvLoaded();
    });

    afterEach(() => {
        delete process.env['XDG_CONFIG_HOME'];
        delete process.env['QA_PROJECT_PROVIDER'];
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    it('applies project values over globals', () => {
        expect.hasAssertions();

        process.env['QA_PROJECT_PROVIDER'] = 'gitlab';
        const dir = path.dirname(projectEnvPath('ibabs'));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(projectEnvPath('ibabs'), 'QA_PROJECT_PROVIDER=github\n');

        applyProjectEnvOverlay('ibabs');

        expect(process.env['QA_PROJECT_PROVIDER']).toBe('github');
    });

    it('is a no-op when the overlay file is absent (explicit, not silent)', () => {
        expect.hasAssertions();

        expect(() => applyProjectEnvOverlay('ghost')).not.toThrow();
        expect(process.env['QA_PROJECT_PROVIDER']).toBeUndefined();
    });

    it('throws on path-traversal / invalid name', () => {
        expect.hasAssertions();

        expect(() => applyProjectEnvOverlay('../escape')).toThrow(/path traversal/);
        expect(() => applyProjectEnvOverlay('')).not.toThrow();
    });
});
