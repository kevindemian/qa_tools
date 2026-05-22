declare module 'readline-sync' {
    export function question(query?: string, options?: { hideEchoBack?: boolean }): string;
    export function keyInYN(query?: string): boolean;
    export function keyInSelect(items: string[], query?: string): number;
}
