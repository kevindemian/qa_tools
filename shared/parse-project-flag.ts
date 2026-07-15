/**
 * Parse a global `--project`/`-p` flag from argv (Fase 5 / 055).
 * Single source of truth reused by `git_triggers/cli-args` and `jira_management/main`.
 */
export function parseProjectFlag(argv: string[]): string | undefined {
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--project' || argv[i] === '-p') {
            const val = argv[i + 1];
            if (val !== undefined && !val.startsWith('-')) return val;
        }
    }
    return undefined;
}
