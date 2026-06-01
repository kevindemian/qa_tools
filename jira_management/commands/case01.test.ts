jest.mock('../../shared/prompt');
jest.mock('../../shared/logger');

jest.mock('../../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

jest.mock('../../shared/config', () => {
    const mockGet = jest.fn();
    return {
        get: mockGet,
        getInstance: jest.fn().mockReturnValue({ get: mockGet }),
    };
});

jest.mock('../create_tests', () => ({
    createTestsFromCsv: jest.fn(),
    createTestsFromJson: jest.fn(),
    createTestExecutionWithLinks: jest.fn(),
}));

jest.mock('./test-execution-flow', () => ({
    offerTestExecutionAssociation: jest.fn().mockResolvedValue({ associated: false }),
    showResults: jest.fn().mockResolvedValue(undefined),
}));

import case01 from './case01';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case01 — create tests from CSV', () => {
    it('exports a handler function', () => {
        expect(case01).toBeDefined();
        expect(typeof case01.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case01.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
