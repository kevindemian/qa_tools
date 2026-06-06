vi.mock('../../shared/prompt');

vi.mock('../../shared/state', async () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

vi.mock('../../shared/config', () => {
    const mockGet = vi.fn();
    return {
        default: {
            get: mockGet,
            getInstance: vi.fn().mockReturnValue({ get: mockGet }),
        },
    };
});

vi.mock('../create_tests', async () => ({
    createTestsFromCsv: vi.fn(),
    createTestsFromJson: vi.fn(),
    createTestExecutionWithLinks: vi.fn(),
}));

vi.mock('./test-execution-flow', async () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', async () => ({
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn(),
}));

import case15 from './case15.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('case15 — create tests from JSON', () => {
    it('exports a handler function', async () => {
        expect(case15).toBeDefined();
        expect(typeof case15.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case15.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
