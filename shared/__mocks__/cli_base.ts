import type { ExitCode } from '../types.js';

interface EnvValidationResult {
    ok: boolean;
    missing: string[];
}

export const mask = vi.fn<(v: string) => string>().mockImplementation((v: string) => v);

export const sanitizeUrl = vi.fn<(url: string) => string>().mockImplementation((url: string) => url);

export const gracefulExit = vi.fn<(code: ExitCode) => void>();

export const setupSigint = vi.fn<(getIsBusy: (() => boolean) | null, onExit: (() => void) | null) => void>();

export const createValidateEnv = vi
    .fn()
    .mockReturnValue(vi.fn<() => EnvValidationResult>().mockReturnValue({ ok: true, missing: [] }));

export const offerEnvSetup = vi.fn<(result: EnvValidationResult) => boolean>().mockReturnValue(false);

export const printSessionSummary = vi.fn<(args: Record<string, unknown>) => void>();
