vi.mock('../../shared/prompt');

vi.mock('./test-execution-flow', async () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
}));

import case13 from './case13.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('case13 — create test execution', () => {
    it('exports a handler function', async () => {
        expect(case13).toBeDefined();
        expect(typeof case13.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case13.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
