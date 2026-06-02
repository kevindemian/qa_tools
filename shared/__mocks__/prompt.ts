import { jest } from '@jest/globals';

export const __setConfig = jest.fn<(cfg: unknown) => void>();
export const isQuiet = jest.fn<() => boolean>().mockReturnValue(false);
export const badge = jest.fn<(label: string) => string>().mockImplementation((label: string) => label);
export const success = jest.fn<(msg: string) => void>();
export const error = jest.fn<(msg: string) => void>();
export const warn = jest.fn<(msg: string) => void>();
export const info = jest.fn<(msg: string) => void>();
export const helpLine = jest.fn<(label: string, desc: string) => void>();
export const print = jest.fn<(msg: string) => void>();
export const title = jest.fn<(msg: string) => void>();
export const divider = jest.fn<() => void>();
export const humanizeError = jest.fn<(err: unknown) => string>().mockReturnValue('humanized error');
export const extractErrorMessage = jest.fn<(err: unknown) => string>().mockReturnValue('mocked error');
export const printError = jest.fn<(msg: string) => void>();
export const printSummary = jest.fn<(lines: string[]) => void>();
export const onError = jest.fn<(msg: string) => void>();
export const tableView = jest.fn<(data: string[][], options?: Record<string, unknown>) => void>();

export class CancelError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'CancelError';
    }
}

export const ProgressBar = jest.fn<(total: number, options?: { width?: number }) => void>();
export const withSpinner = jest.fn(<T>(_label: string, fn: () => Promise<T>) => fn());
export const __setOraDep = jest.fn<(mod: unknown) => void>();

export const prompt = jest.fn<() => Promise<string>>().mockResolvedValue('');
export const confirm = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
export const smartPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('');
export const ask = jest.fn<(msg: string) => Promise<string>>().mockResolvedValue('');
export const askFilePath = jest.fn<(msg: string) => Promise<string>>().mockResolvedValue('');
export const askConfirm = jest.fn<(msg: string) => Promise<boolean>>().mockResolvedValue(false);
export const showSelect = jest.fn<(msg: string, choices: string[]) => Promise<string>>().mockResolvedValue('0');
export const __setSelectMod = jest.fn<(mod: unknown) => void>();
export const __setInputMod = jest.fn<(mod: unknown) => void>();
export const __setConfirmMod = jest.fn<(mod: unknown) => void>();
