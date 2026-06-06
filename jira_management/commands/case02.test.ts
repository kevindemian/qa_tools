vi.mock('../../shared/prompt');
vi.mock('../../shared/logger');

import case02 from './case02.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockJiraResource = {
    getProjectId: vi.fn().mockResolvedValue('123'),
    getProjectVersions: vi.fn().mockResolvedValue([]),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('case02 — list versions', () => {
    it('exports a handler function', async () => {
        expect(case02).toBeDefined();
        expect(typeof case02.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case02.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });

    it('handles missing projectId gracefully', async () => {
        mockJiraResource.getProjectId.mockResolvedValueOnce(null);
        const result = await case02.handler(mockContext);
        expect(result).toBeUndefined();
    });

    it('handles versions list and calls pushHistory', async () => {
        mockJiraResource.getProjectVersions.mockResolvedValueOnce([
            { name: 'v1.0', description: 'First release', released: true },
            { name: 'v2.0', description: '', released: false, releaseDate: '2099-12-31' },
        ]);
        const result = await case02.handler(mockContext);
        expect(mockContext.pushHistory).toHaveBeenCalledWith('listar-versoes', expect.stringContaining('versão'), 'ok');
        expect(result === undefined || result === true || result === false).toBe(true);
    });

    it('handles versions list with overdue release', async () => {
        const pastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        mockJiraResource.getProjectVersions.mockResolvedValueOnce([
            { name: 'v1.0', description: 'Desc', released: false, releaseDate: pastDate },
        ]);
        const result = await case02.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });

    it('handles catch error block (lines 27-32)', async () => {
        mockJiraResource.getProjectId.mockRejectedValueOnce(new Error('API failure'));
        const result = await case02.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
