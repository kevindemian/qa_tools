import { detectNumericRange } from './numeric.js';

describe('detectNumericRange', () => {
    it('returns null for empty input', () => {
        expect(detectNumericRange('')).toBeNull();
    });

    it('returns range for "between X and Y"', () => {
        const result = detectNumericRange('ages between 18 and 65');
        expect(result).toEqual({ min: 18, max: 65 });
    });

    it('returns range for "X to Y"', () => {
        const result = detectNumericRange('password 6 to 30 chars');
        expect(result).toEqual({ min: 6, max: 30 });
    });

    it('returns range for "X-Y"', () => {
        const result = detectNumericRange('range 1-100');
        expect(result).toEqual({ min: 1, max: 100 });
    });

    it('returns range for "X through Y"', () => {
        const result = detectNumericRange('values 10 through 20');
        expect(result).toEqual({ min: 10, max: 20 });
    });

    it('returns null when min >= max', () => {
        expect(detectNumericRange('ages between 65 and 18')).toBeNull();
    });

    it('returns null when no numbers present', () => {
        expect(detectNumericRange('no numbers here')).toBeNull();
    });

    it('returns null for single number only', () => {
        expect(detectNumericRange('exactly 42')).toBeNull();
    });
});
