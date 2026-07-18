import { testCoupling } from '../resource-utils.js';

describe('TestCoupling', () => {
    it.each([
        ['Create user_carlos', 'Delete user_carlos', true],
        ['Delete user_bob', 'Create user_bob', true],
        ['Create admin_user', 'Delete guest_user', false],
        ['Registrar usuario_teste', 'Remover usuario_teste', true],
        ['View page', 'Click button', false],
        ['Create form', 'Delete form', false],
    ])('detects resource coupling correctly (stepsA=%s, stepsB=%s)', (stepsA, stepsB, expected) => {
        expect.hasAssertions();

        expect(testCoupling(stepsA, stepsB)).toBe(expected);
    });
});
