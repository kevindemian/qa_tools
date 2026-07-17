/** Terminal output abstraction: wraps console.log/error/warn and adds `box()` rendering.
 * Use {@link defaultOutput} as the singleton. */
import type { BoxOptions } from './box.js';
import { box as boxRender } from './box.js';
import Config from './config-accessor.js';

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
        process.stdout.write(args.map(String).join(' ') + '\n');
    }

    error(...args: Parameters<typeof console.error>): void {
        process.stderr.write(args.map(String).join(' ') + '\n');
    }

    warn(...args: Parameters<typeof console.warn>): void {
        process.stderr.write(args.map(String).join(' ') + '\n');
    }

    box(lines: string[], options?: BoxOptions): void {
        this.print(boxRender(lines, options));
    }
}

export const defaultOutput = new Output();
