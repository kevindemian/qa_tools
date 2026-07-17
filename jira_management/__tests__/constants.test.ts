import { statusNotMapped } from '../constants.js';

describe('Constants', () => {
    describe('StatusNotMapped', () => {
        it('returns formatted string', () => {
            const result = statusNotMapped('TASK-42', 'In Progress');

            expect(result).toContain('TASK-42');
            expect(result).toContain('In Progress');
            expect(result).toContain('não mapeado');
        });
    });
});
