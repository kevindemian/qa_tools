import { formatBranch } from './ui-helpers';

describe('formatBranch', () => {
    it('strips ANSI escape sequences from branch name', () => {
        const input = '\u001b[32mmain\u001b[0m';
        const result = formatBranch(input);
        expect(result).toBe('main');
    });

    it('returns clean string when no ANSI codes present', () => {
        const result = formatBranch('feature/new-feature');
        expect(result).toBe('feature/new-feature');
    });

    it('handles empty string', () => {
        const result = formatBranch('');
        expect(result).toBe('');
    });
});
