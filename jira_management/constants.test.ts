import { statusNotMapped } from './constants.js';

describe('constants', () => {
    describe('statusNotMapped', () => {
        it('returns formatted string', async () => {
            const result = statusNotMapped('TASK-42', 'In Progress');
            expect(result).toContain('TASK-42');
            expect(result).toContain('In Progress');
            expect(result).toContain('não mapeado');
        });
    });
});
