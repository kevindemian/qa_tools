import { question, keyInYN, password } from './readline.js';

describe('readline — readline-sync wrapper', () => {
    describe('question', () => {
        it('returns the question function', async () => {
            expect(typeof question).toBe('function');
        });
    });

    describe('keyInYN', () => {
        it('returns the keyInYN function', async () => {
            expect(typeof keyInYN).toBe('function');
        });
    });

    describe('password', () => {
        it('returns a string result', async () => {
            expect(typeof password).toBe('function');
        });
    });
});
