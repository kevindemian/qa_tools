vi.mock('../../shared/prompt');

vi.mock('./test-execution-flow', () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
}));

import case13 from './case13.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

describe('Case13', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case13 — create test execution', () => {
        it('exports a handler function', () => {
            expect(case13).toBeDefined();
            expect(typeof case13.handler).toBe('function');
        });

        it('executes without error with basic context', async () => {
            expect.hasAssertions();

            const result = await case13.handler(mockContext);

            expect(result === undefined || typeof result === 'boolean').toBeTruthy();
        });
    });
});
