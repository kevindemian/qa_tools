import { jest } from '@jest/globals';

export const __setOraDep = jest.fn<(mod: unknown) => void>();

export const withSpinner = jest.fn(<T>(_label: string, fn: () => Promise<T>) => fn());

export class ProgressBar {
    current = 0;

    constructor(_total: number, _options?: { width?: number }) {}

    update = jest.fn<(val: number) => void>();
    stop = jest.fn<() => void>();
}
