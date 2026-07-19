export const __setConfig = vi.fn<(cfg: unknown) => void>();
export const isQuiet = vi.fn<() => boolean>().mockReturnValue(false);
export const badge = vi.fn<(label: string) => string>().mockImplementation((label: string) => label);
export const success = vi.fn<(msg: string) => void>();
export const error = vi.fn<(msg: string) => void>();
export const warn = vi.fn<(msg: string) => void>();
export const info = vi.fn<(msg: string) => void>();
export const helpLine = vi.fn<(label: string, desc: string) => void>();
export const print = vi.fn<(msg: string) => void>();
export const title = vi.fn<(msg: string) => void>();
export const divider = vi.fn<() => void>();
export const humanizeError = vi.fn<(err: unknown) => string>().mockReturnValue('humanized error');
export const extractErrorMessage = vi.fn<(err: unknown) => string>().mockReturnValue('mocked error');
export const printError = vi.fn<(msg: string) => void>();
export const printSummary = vi.fn<(lines: string[]) => void>();
export const onError = vi.fn<(msg: string) => void>();
export const tableView = vi.fn<(data: string[][], options?: Record<string, unknown>) => void>();

export class CancelError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'CancelError';
    }
}

export const ProgressBar = vi.fn<(total: number, options?: { width?: number }) => void>();
export const withSpinner = vi.fn(<T>(_label: string, fn: () => Promise<T>) => fn());
export const __setOraDep = vi.fn<(mod: unknown) => void>();

export const prompt = vi.fn<() => Promise<string>>().mockResolvedValue('');
export const confirm = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
export const smartPrompt = vi.fn<() => Promise<string>>().mockResolvedValue('');
export const ask = vi.fn<(msg: string) => Promise<string>>().mockResolvedValue('');
export const askMultiline = vi.fn<(msg: string) => Promise<string>>().mockResolvedValue('');
export const askFilePath = vi.fn<(msg: string) => Promise<string>>().mockResolvedValue('');
export const askConfirm = vi.fn<(msg: string) => Promise<boolean>>().mockResolvedValue(false);
export const showSelect = vi.fn<(msg: string, choices: string[]) => Promise<string>>().mockResolvedValue('0');
export const __setSelectMod = vi.fn<(mod: unknown) => void>();
export const __setInputMod = vi.fn<(mod: unknown) => void>();
export const __setConfirmMod = vi.fn<(mod: unknown) => void>();
