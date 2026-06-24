vi.mock('../../shared/prompt');

vi.mock('../../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

import case09 from './case09.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Case09 — switch project', () => {
    it('exports a handler function', () => {
        expect(case09).toBeDefined();
        expect(typeof case09.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case09.handler(mockContext);

        expect(result === undefined || typeof result === 'boolean').toBeTruthy();
    });
});
