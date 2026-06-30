import type { BoxOptions } from '../box.js';

export class Output {
    static readonly isTTY = vi.fn<() => boolean>().mockReturnValue(true);
    static readonly isCI = vi.fn<() => boolean>().mockReturnValue(false);
    static readonly columns = vi.fn<() => number>().mockReturnValue(80);
    static readonly rows = vi.fn<() => number>().mockReturnValue(24);

    print = vi.fn<(...args: string[]) => void>();
    error = vi.fn<(...args: string[]) => void>();
    warn = vi.fn<(...args: string[]) => void>();
    box = vi.fn<(lines: string[], options?: BoxOptions) => void>();
}

export const defaultOutput = new Output();
