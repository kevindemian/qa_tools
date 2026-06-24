import { parseCliArgs } from './cli-args.js';

const ORIG_ARGV = process.argv;

describe('ParseCliArgs', () => {
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

        expect(parseCliArgs().help).toBeTruthy();
    });

    it('detects -h', () => {
        process.argv.push('-h');

        expect(parseCliArgs().help).toBeTruthy();
    });

    it('detects --version', () => {
        process.argv.push('--version');

        expect(parseCliArgs().version).toBeTruthy();
    });

    it('detects --no-clear', () => {
        process.argv.push('--no-clear');

        expect(parseCliArgs().noClear).toBeTruthy();
    });

    it('detects multiple flags (help takes priority)', () => {
        process.argv.push('--help', '--version');
        const args = parseCliArgs();

        expect(args.help).toBeTruthy();
        expect(args.mode).toBe('help');
        expect(args.noClear).toBeFalsy();
    });
});
