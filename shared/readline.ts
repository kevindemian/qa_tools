/**
 * Readline wrapper — isolates readline-sync for dependency management.
 *
 * All synchronous terminal input MUST go through this module.
 * Replacing readline-sync requires changing only this file.
 *
 * @module readline
 */
import readlineSync from 'readline-sync';

export interface QuestionOptions {
    defaultInput?: string;
    hideEchoBack?: boolean;
    limit?: RegExp;
    limitMessage?: string;
}

/** Ask a question and return the answer synchronously. */
export function question(query: string, options?: QuestionOptions): string {
    return readlineSync.question(query, options);
}

/** Ask a yes/no question and return boolean. */
export function keyInYN(query: string): boolean | null {
    return readlineSync.keyInYN(query);
}

/** Read a password without echo. */
export function password(query: string, options?: { mask?: string }): string {
    return readlineSync.question(query, { hideEchoBack: true, ...options });
}
