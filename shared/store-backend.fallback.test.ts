import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('child_process', async () => {
    const actual = await vi.importActual('child_process');
    return {
        ...actual,
        execSync: vi.fn(),
    };
});

import { execSync } from 'child_process';
import { detectStoreBackend, FsStoreBackend } from './store-backend.js';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('detectStoreBackend fallback', () => {
    const origXdg = process.env.XDG_STATE_HOME;

    afterAll(() => {
        if (origXdg) process.env.XDG_STATE_HOME = origXdg;
        else delete process.env.XDG_STATE_HOME;
    });

    it('returns FsStoreBackend when git is unavailable', () => {
        process.env.XDG_STATE_HOME = '/tmp/nonexistent-xdg-fallback';
        vi.mocked(execSync).mockImplementation(() => {
            throw new Error('ENOGIT');
        });

        const backend = detectStoreBackend();
        expect(backend).toBeInstanceOf(FsStoreBackend);
    });
});
