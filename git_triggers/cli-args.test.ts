import { parseCliArgs } from './cli-args.js';

const ORIG_ARGV = process.argv;

describe('parseCliArgs', () => {
    beforeEach(() => {
        process.argv = ['node', 'main.ts'];
    });

    afterEach(() => {
        process.argv = ORIG_ARGV;
    });

    it('returns all false when no flags', () => {
        const args = parseCliArgs();
        expect(args).toEqual({ help: false, version: false, noClear: false });
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

    it('detects multiple flags', () => {
        process.argv.push('--help', '--version');
        const args = parseCliArgs();
        expect(args.help).toBe(true);
        expect(args.version).toBe(true);
        expect(args.noClear).toBe(false);
    });
});
