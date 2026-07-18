export const __setOraDep = vi.fn<(mod: unknown) => void>();

export const withSpinner = vi.fn(<T>(_label: string, fn: () => Promise<T>) => fn());

export class ProgressBar {
    current = 0;

    constructor(_total: number, _options?: { width?: number }) {}

    update = vi.fn<(val: number) => void>();
    stop = vi.fn<() => void>();
}
