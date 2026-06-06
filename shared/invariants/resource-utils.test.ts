import { testCoupling } from './resource-utils.js';

describe('testCoupling', () => {
    it('detects coupling when A creates and B deletes same resource', () => {
        const stepsA = 'Create user_carlos';
        const stepsB = 'Delete user_carlos';
        expect(testCoupling(stepsA, stepsB)).toBe(true);
    });

    it('detects coupling when B creates and A deletes same resource', () => {
        const stepsA = 'Delete user_bob';
        const stepsB = 'Create user_bob';
        expect(testCoupling(stepsA, stepsB)).toBe(true);
    });

    it('returns false for different resources', () => {
        const stepsA = 'Create admin_user';
        const stepsB = 'Delete guest_user';
        expect(testCoupling(stepsA, stepsB)).toBe(false);
    });

    it('detects Portuguese resource coupling', () => {
        const stepsA = 'Registrar usuario_teste';
        const stepsB = 'Remover usuario_teste';
        expect(testCoupling(stepsA, stepsB)).toBe(true);
    });

    it('returns false when no create/delete keywords present', () => {
        const stepsA = 'View page';
        const stepsB = 'Click button';
        expect(testCoupling(stepsA, stepsB)).toBe(false);
    });

    it('ignores common words', () => {
        const stepsA = 'Create form';
        const stepsB = 'Delete form';
        expect(testCoupling(stepsA, stepsB)).toBe(false);
    });
});
