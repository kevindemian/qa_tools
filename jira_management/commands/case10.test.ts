vi.mock('../../shared/prompt');

import case10 from './case10.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockContext = makeMockCommandContext({
    ctx: {
        createPackageManager: vi.fn().mockReturnValue({ updateReleaseNotes: vi.fn(), updateVersion: vi.fn() }),
    },
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('case10 — set directory', () => {
    it('exports a handler function', async () => {
        expect(case10).toBeDefined();
        expect(typeof case10.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case10.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
