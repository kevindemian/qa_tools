import type { BoxOptions } from '../box.js';

export class Output {
    static isTTY = vi.fn<() => boolean>().mockReturnValue(true);
    static isCI = vi.fn<() => boolean>().mockReturnValue(false);
    static columns = vi.fn<() => number>().mockReturnValue(80);
    static rows = vi.fn<() => number>().mockReturnValue(24);

    print = vi.fn<(...args: string[]) => void>();
    error = vi.fn<(...args: string[]) => void>();
    warn = vi.fn<(...args: string[]) => void>();
    box = vi.fn<(lines: string[], options?: BoxOptions) => void>();
}

export const defaultOutput = new Output();
