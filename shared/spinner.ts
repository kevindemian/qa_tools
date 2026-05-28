/** Spinner (ora ESM) and progress bar (cli-progress) for interactive terminal feedback. */
import cliProgress from 'cli-progress';
import { Output, defaultOutput as output } from './output';
import { isQuiet } from './prompt-ui';

interface SpinnerOptions {
    type?: 'dots' | 'bouncingBar' | 'earth';
    color?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ora is ESM-only, dynamic import in CJS
let _ora: any = null;

/** Override the ora dependency (used by tests / ESM fallback). */
export function __setOraDep(mod: unknown): void {
    _ora = mod;
}

/** Run an async function with a terminal spinner. Falls back to `fn()` directly in CI/quiet/non-TTY. */
export async function withSpinner<T>(label: string, fn: () => Promise<T>, options?: SpinnerOptions): Promise<T> {
    if (isQuiet() || !Output.isTTY() || Output.isCI()) return fn();
    if (!_ora) _ora = (await import('ora')).default;
    const spinner = _ora({
        text: label,
        color: options?.color || 'cyan',
        spinner: options?.type || 'dots',
    }).start();
    try {
        const result = await fn();
        spinner.succeed();
        return result;
    } catch (err) {
        spinner.fail();
        throw err;
    }
}

/** CLI progress bar (cli-progress). Falls back to text output in non-TTY environments. */
export class ProgressBar {
    current = 0;

    private readonly bar: cliProgress.SingleBar | null = null;
    private readonly total: number;
    private readonly enabled: boolean;

    constructor(total: number, options: { width?: number } = {}) {
        this.total = total;
        this.enabled = Output.isTTY() && !isQuiet();
        if (this.enabled) {
            this.bar = new cliProgress.SingleBar(
                {
                    format: `{bar} {percentage}% | {value}/{total} | {duration_formatted}`,
                    barCompleteChar: '\u2588',
                    barIncompleteChar: '\u2591',
                    hideCursor: true,
                    barsize: options.width || 20,
                    noTTYOutput: false,
                },
                cliProgress.Presets.shades_classic,
            );
            this.bar.start(total, 0);
        }
    }

    update(val: number): void {
        this.current = val;
        if (this.enabled && this.bar) {
            this.bar.update(val);
        } else {
            const pct = this.total > 0 ? Math.round((val / this.total) * 100) : 0;
            output.print('  Progresso: ' + val + '/' + this.total + ' (' + pct + '%)');
        }
    }

    stop(): void {
        if (this.enabled && this.bar) {
            this.bar.stop();
        }
    }
}
