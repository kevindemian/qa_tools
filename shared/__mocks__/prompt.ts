export const __setConfig = jest.fn();
export const isQuiet = jest.fn().mockReturnValue(false);
export const badge = jest.fn();
export const success = jest.fn();
export const error = jest.fn();
export const warn = jest.fn();
export const info = jest.fn();
export const helpLine = jest.fn();
export const print = jest.fn();
export const title = jest.fn();
export const divider = jest.fn();
export const humanizeError = jest.fn();
export const extractErrorMessage = jest.fn().mockReturnValue('mocked error');
export const printError = jest.fn();
export const printSummary = jest.fn();
export const onError = jest.fn();
export const tableView = jest.fn();
export class CancelError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'CancelError';
    }
}
export const ProgressBar = jest.fn();
export const withSpinner = jest.fn().mockImplementation(<T>(_label: string, fn: () => Promise<T>) => fn());
export const __setOraDep = jest.fn();
export const prompt = jest.fn().mockResolvedValue('');
export const confirm = jest.fn().mockResolvedValue(false);
export const smartPrompt = jest.fn().mockResolvedValue('');
export const ask = jest.fn().mockResolvedValue('');
export const askFilePath = jest.fn().mockResolvedValue('');
export const askConfirm = jest.fn().mockResolvedValue(false);
export const showSelect = jest.fn().mockResolvedValue('0');
export const __setSelectMod = jest.fn();
export const __setInputMod = jest.fn();
export const __setConfirmMod = jest.fn();
