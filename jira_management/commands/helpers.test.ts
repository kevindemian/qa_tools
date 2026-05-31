/** Tests for helpers.ts (re-export backward-compat shim). */
describe('helpers', () => {
    it('re-exports offerTestExecutionAssociation and showResults', () => {
        const h = require('./helpers');
        expect(typeof h.offerTestExecutionAssociation).toBe('function');
        expect(typeof h.showResults).toBe('function');
    });
});
