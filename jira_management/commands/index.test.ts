import { getHandler } from './index';

describe('getHandler', () => {
    it('returns a handler function for known case numbers', () => {
        const handler = getHandler('1');
        expect(handler).toBeInstanceOf(Function);
    });

    it('returns a handler for each case 1-19', () => {
        for (let i = 1; i <= 19; i++) {
            const h = getHandler(String(i));
            expect(h).toBeInstanceOf(Function);
        }
    });

    it('returns null for unknown case number', () => {
        const handler = getHandler('99');
        expect(handler).toBeNull();
    });

    it('returns null for empty string', () => {
        const handler = getHandler('');
        expect(handler).toBeNull();
    });
});
