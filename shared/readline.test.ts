import { describe, expect, it, vi } from 'vitest';

vi.mock('readline-sync', () => ({
    default: {
        question: vi.fn(),
        keyInYN: vi.fn(),
    },
}));

const readlineSync = await import('readline-sync');

describe('Readline — readline-sync wrapper', () => {
    describe('Question', () => {
        it('calls readlineSync.question with query and options', async () => {expect.hasAssertions();

            const { question } = await import('./readline.js');
            vi.spyOn(readlineSync.default, 'question').mockReturnValue('answer');
            const result = question('prompt> ', { defaultInput: 'yes' });

            expect(result).toBe('answer');
            expect(readlineSync.default.question).toHaveBeenCalledWith('prompt> ', { defaultInput: 'yes' });
        });

        it('calls readlineSync.question without options', async () => {expect.hasAssertions();

            const { question } = await import('./readline.js');
            vi.spyOn(readlineSync.default, 'question').mockReturnValue('yes');
            const result = question('ask: ');

            expect(result).toBe('yes');
            expect(readlineSync.default.question).toHaveBeenCalledWith('ask: ', undefined);
        });
    });

    describe('KeyInYN', () => {
        it('calls readlineSync.keyInYN and returns result', async () => {expect.hasAssertions();

            const { keyInYN } = await import('./readline.js');
            vi.spyOn(readlineSync.default, 'keyInYN').mockReturnValue(true);
            const result = keyInYN('Continue? ');

            expect(result).toBeTruthy();
            expect(readlineSync.default.keyInYN).toHaveBeenCalledWith('Continue? ');
        });
    });

    describe('Password', () => {
        it('calls readlineSync.question with hideEchoBack', async () => {expect.hasAssertions();

            const { password } = await import('./readline.js');
            vi.spyOn(readlineSync.default, 'question').mockReturnValue('secret');
            const result = password('Password: ');

            expect(result).toBe('secret');
            expect(readlineSync.default.question).toHaveBeenCalledWith('Password: ', { hideEchoBack: true });
        });

        it('passes mask option', async () => {expect.hasAssertions();

            const { password } = await import('./readline.js');
            vi.spyOn(readlineSync.default, 'question').mockReturnValue('pwd');
            const result = password('PIN: ', { mask: '*' });

            expect(result).toBe('pwd');
            expect(readlineSync.default.question).toHaveBeenCalledWith('PIN: ', { hideEchoBack: true, mask: '*' });
        });
    });
});
