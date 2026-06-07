import { parseCliArgs } from './cli-args.js';

const ORIG_ARGV = process.argv;

describe('parseCliArgs', () => {
    beforeEach(() => {
        process.argv = ['node', 'main.ts'];
    });

    afterEach(() => {
        process.argv = ORIG_ARGV;
    });

    it('returns interactive mode when no flags', () => {
        const args = parseCliArgs();
        expect(args).toEqual({ mode: 'interactive', help: false, version: false, noClear: false });
    });

    it('detects --help', () => {
        process.argv.push('--help');
        expect(parseCliArgs().help).toBe(true);
    });

    it('detects -h', () => {
        process.argv.push('-h');
        expect(parseCliArgs().help).toBe(true);
    });

    it('detects --version', () => {
        process.argv.push('--version');
        expect(parseCliArgs().version).toBe(true);
    });

    it('detects --no-clear', () => {
        process.argv.push('--no-clear');
        expect(parseCliArgs().noClear).toBe(true);
    });

    it('detects multiple flags (help takes priority)', () => {
        process.argv.push('--help', '--version');
        const args = parseCliArgs();
        expect(args.help).toBe(true);
        expect(args.mode).toBe('help');
        expect(args.noClear).toBe(false);
    });
});
