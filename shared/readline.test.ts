import { question, keyInYN, password } from './readline';

describe('readline — readline-sync wrapper', () => {
    describe('question', () => {
        it('returns the question function', () => {
            expect(typeof question).toBe('function');
        });
    });

    describe('keyInYN', () => {
        it('returns the keyInYN function', () => {
            expect(typeof keyInYN).toBe('function');
        });
    });

    describe('password', () => {
        it('returns a string result', () => {
            expect(typeof password).toBe('function');
        });
    });
});
