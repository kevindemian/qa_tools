import { jest } from '@jest/globals';
import type { BoxOptions } from '../box';

export class Output {
    static isTTY = jest.fn<() => boolean>().mockReturnValue(true);
    static isCI = jest.fn<() => boolean>().mockReturnValue(false);
    static columns = jest.fn<() => number>().mockReturnValue(80);
    static rows = jest.fn<() => number>().mockReturnValue(24);

    print = jest.fn<(...args: string[]) => void>();
    error = jest.fn<(...args: string[]) => void>();
    warn = jest.fn<(...args: string[]) => void>();
    box = jest.fn<(lines: string[], options?: BoxOptions) => void>();
}

export const defaultOutput = new Output();
