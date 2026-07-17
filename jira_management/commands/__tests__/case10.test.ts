vi.mock('../../../shared/prompt');

import case10 from '../case10.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockContext = makeMockCommandContext({
    ctx: {
        createPackageManager: vi.fn().mockReturnValue({ updateReleaseNotes: vi.fn(), updateVersion: vi.fn() }),
    },
});

describe('Case10', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case10 — set directory', () => {
        it('exports a handler function', () => {
            expect(case10).toBeDefined();
            expect(typeof case10.handler).toBe('function');
        });

        it('executes without error with basic context', async () => {
            expect.hasAssertions();

            const result = await case10.handler(mockContext);

            expect(result === undefined || typeof result === 'boolean').toBeTruthy();
        });
    });
});
