/**
 * Unified CLI argument parser for git_triggers.
 * Supports both interactive and batch modes with discriminated union.
 */
import { defaultOutput } from '../shared/output.js';
import { parseProjectFlag } from '../shared/parse-project-flag.js';
export type CliMode = 'interactive' | 'batch' | 'help' | 'version';

export interface BaseCliArgs {
    mode: CliMode;
    help: boolean;
    version: boolean;
    noClear: boolean;
    /** Project name from `--project`/`-p` (available in all modes, Fase 5 / 055). */
    project?: string;
}

export interface BatchCliArgs extends BaseCliArgs {
    mode: 'batch';
    project?: string;
    branch: string | undefined;
    auto: boolean;
    publish: string | undefined;
    runImpactedTests: boolean;
    conservative: boolean;
    teKey: string | undefined;
    dryRun: boolean;
}

export interface InteractiveCliArgs extends BaseCliArgs {
    mode: 'interactive';
}

export interface HelpCliArgs extends BaseCliArgs {
    mode: 'help';
}

export interface VersionCliArgs extends BaseCliArgs {
    mode: 'version';
}

export type CliArgs = BatchCliArgs | InteractiveCliArgs | HelpCliArgs | VersionCliArgs;

/**
 * Extracts the next argument value after a flag, or undefined if out of bounds.
 */
function _nextArg(args: string[], i: number): string | undefined {
    return i + 1 < args.length ? args[i + 1] : undefined;
}

/** Scan the full argv for a global `--project`/`-p` flag (055). Available in all modes. */
export function _extractProject(args: string[]): string | undefined {
    return parseProjectFlag(args);
}

/**
 * Parses command line arguments into a discriminated union.
 * Batch mode is triggered when any batch-specific flag is present.
 */
function parseBatchFlag(args: string[], i: number, result: BatchCliArgs): number {
    const val = _nextArg(args, i);
    switch (Reflect.get(args, i)) {
        case '--project':
        case '-p':
            if (val !== undefined) {
                result.project = val;
                return i + 1;
            }
            return i;
        case '--branch':
        case '-b':
            if (val !== undefined) {
                result.branch = val;
                return i + 1;
            }
            return i;
        case '--auto':
        case '--batch':
            result.auto = true;
            return i;
        case '--publish':
            if (val !== undefined) {
                result.publish = val;
                return i + 1;
            }
            return i;
        case '--run-impacted-tests':
            result.runImpactedTests = true;
            return i;
        case '--conservative':
            result.conservative = true;
            return i;
        case '--dry-run':
            result.dryRun = true;
            return i;
        case '--te-key':
        case '-k':
            if (val !== undefined) {
                result.teKey = val;
                return i + 1;
            }
            return i;
        default:
            return i;
    }
}

export function parseCliArgs(): CliArgs {
    const args = process.argv.slice(2);

    const hasBatchFlag = args.some((arg) =>
        [
            '--project',
            '-p',
            '--branch',
            '-b',
            '--auto',
            '--batch',
            '--publish',
            '--run-impacted-tests',
            '--conservative',
            '--dry-run',
            '--te-key',
            '-k',
        ].includes(arg),
    );

    const help = args.includes('--help') || args.includes('-h');
    const version = args.includes('--version');
    const noClear = args.includes('--no-clear');
    const project = _extractProject(args);

    if (help) {
        return { mode: 'help', help: true, version: false, noClear: false, ...(project ? { project } : {}) };
    }
    if (version) {
        return { mode: 'version', help: false, version: true, noClear: false, ...(project ? { project } : {}) };
    }

    if (hasBatchFlag) {
        const result: BatchCliArgs = {
            mode: 'batch',
            help: false,
            version: false,
            noClear,
            ...(project ? { project } : {}),
            branch: undefined,
            auto: false,
            publish: undefined,
            runImpactedTests: false,
            conservative: false,
            teKey: undefined,
            dryRun: false,
        };

        let idx = 0;
        while (idx < args.length) {
            idx = parseBatchFlag(args, idx, result);
            idx++;
        }

        if (!result.auto && !result.project && !result.branch) {
            result.auto = true;
        }

        return result;
    }

    return {
        mode: 'interactive',
        help: false,
        version: false,
        noClear,
        ...(project ? { project } : {}),
    };
}

/**
 * Prints usage information for the CLI.
 */
export function printUsage(packageVersion: string): void {
    const lines = [
        'QA Tools — Git Triggers',
        '',
        `Version: ${packageVersion}`,
        '',
        'Usage: npx tsx git_triggers/main.ts [options]',
        '',
        'Modes:',
        '  (no flags)           Interactive menu mode',
        '  --auto, --batch      Batch mode (headless CI/CD)',
        '  --project, -p <name> Project name (batch)',
        '  --branch, -b <name>  Branch name (batch)',
        '',
        'Batch options:',
        '  --publish <target>   Publish reports (s3 | gh-pages)',
        '  --run-impacted-tests Run test impact selection',
        '  --conservative       Conservative test selection mode',
        '  --dry-run            Show execution plan without running',
        '  --te-key, -k <key>   Test execution key for Jira',
        '',
        'Global options:',
        '  --help, -h           Show this help',
        '  --version            Show version',
        '  --no-clear           Disable screen clearing in interactive mode',
    ];
    lines.forEach((line) => defaultOutput.print(line));
}
