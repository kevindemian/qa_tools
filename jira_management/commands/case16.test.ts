vi.mock('../../shared/prompt');

vi.mock('../../shared/state', async () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

import case16 from './case16.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('case16 — config JSON directory', () => {
    it('exports a handler function', async () => {
        expect(case16).toBeDefined();
        expect(typeof case16.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case16.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
