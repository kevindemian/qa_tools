/** Terminal output abstraction: wraps console.log/error/warn and adds `box()` rendering.
 * Use {@link defaultOutput} as the singleton. */
import type { BoxOptions } from './box';
import { box as boxRender } from './box';
import Config from './config';

export class Output {
    static isTTY(): boolean {
        return !!process.stdout.isTTY;
    }

    static isCI(): boolean {
        return Config.get('CI') === 'true';
    }

    static columns(): number {
        return process.stdout.columns || 80;
    }

    static rows(): number {
        return process.stdout.rows || 24;
    }

    print(...args: Parameters<typeof console.log>): void {
        // eslint-disable-next-line no-console
        console.log(...args);
    }

    error(...args: Parameters<typeof console.error>): void {
        // eslint-disable-next-line no-console
        console.error(...args);
    }

    warn(...args: Parameters<typeof console.warn>): void {
        // eslint-disable-next-line no-console
        console.warn(...args);
    }

    box(lines: string[], options?: BoxOptions): void {
        this.print(boxRender(lines, options));
    }
}

export const defaultOutput = new Output();
