export class Output {
    static isTTY(): boolean {
        return !!process.stdout.isTTY;
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
}

export const defaultOutput = new Output();
