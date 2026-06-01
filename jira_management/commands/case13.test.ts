jest.mock('../../shared/prompt');

jest.mock('./test-execution-flow', () => ({
    offerTestExecutionAssociation: jest.fn().mockResolvedValue({ associated: false }),
    showResults: jest.fn().mockResolvedValue(undefined),
}));

import case13 from './case13';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case13 — create test execution', () => {
    it('exports a handler function', () => {
        expect(case13).toBeDefined();
        expect(typeof case13.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case13.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
