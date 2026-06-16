vi.mock('../../shared/prompt');
vi.mock('../../shared/logger');

vi.mock('../../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    loadTypedState: vi.fn().mockReturnValue({}),
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

vi.mock('../create_tests', () => ({
    default: {
        createTestsFromCsv: vi.fn(),
        createTestsFromJson: vi.fn(),
        createTestExecutionWithLinks: vi.fn(),
    },
}));

vi.mock('./test-execution-flow', () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
}));

import case01 from './case01.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('case01 — create tests from CSV', () => {
    it('exports a handler function for menu registration', () => {
        expect(case01).toBeDefined();
        expect(typeof case01.handler).toBe('function');
    });

    it('runs full CSV import flow with mocked dependencies without throwing', async () => {
        const result = await case01.handler(mockContext);
        expect([undefined, true, false]).toContain(result);
    });
});
