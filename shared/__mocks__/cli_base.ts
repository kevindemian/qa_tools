import { jest } from '@jest/globals';
import type { ExitCode } from '../types';

interface EnvValidationResult {
    ok: boolean;
    missing: string[];
}

export const mask = jest.fn<(v: string) => string>().mockImplementation((v: string) => v);

export const sanitizeUrl = jest.fn<(url: string) => string>().mockImplementation((url: string) => url);

export const gracefulExit = jest.fn<(code: ExitCode) => void>();

export const setupSigint = jest.fn<(getIsBusy: (() => boolean) | null, onExit: (() => void) | null) => void>();

export const createValidateEnv = jest
    .fn()
    .mockReturnValue(jest.fn<() => EnvValidationResult>().mockReturnValue({ ok: true, missing: [] }));

export const offerEnvSetup = jest.fn<(result: EnvValidationResult) => boolean>().mockReturnValue(false);

export const printSessionSummary = jest.fn<(args: Record<string, unknown>) => void>();
