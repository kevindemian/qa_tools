import { describe, expect, it, vi } from 'vitest';

vi.mock('child_process', async () => {
    const actual = await vi.importActual('child_process');
    return {
        ...actual,
        execFileSync: vi.fn(),
    };
});

import { execFileSync } from 'child_process';
import { detectStoreBackend, FsStoreBackend } from './store-backend.js';

describe('detectStoreBackend fallback', () => {
    const origXdg = process.env.XDG_STATE_HOME;

    afterAll(() => {
        if (origXdg) process.env.XDG_STATE_HOME = origXdg;
        else delete process.env.XDG_STATE_HOME;
    });

    it('returns FsStoreBackend when git is unavailable', () => {
        process.env.XDG_STATE_HOME = '/tmp/nonexistent-xdg-fallback';
        vi.mocked(execFileSync).mockImplementation(() => {
            throw new Error('ENOGIT');
        });

        const backend = detectStoreBackend();
        expect(backend).toBeInstanceOf(FsStoreBackend);
    });
});
