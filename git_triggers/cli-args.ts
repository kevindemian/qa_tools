export interface CliArgs {
    help: boolean;
    version: boolean;
    noClear: boolean;
}

export function parseCliArgs(): CliArgs {
    return {
        help: process.argv.includes('--help') || process.argv.includes('-h'),
        version: process.argv.includes('--version'),
        noClear: process.argv.includes('--no-clear'),
    };
}
