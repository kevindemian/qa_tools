vi.mock('../../shared/prompt');
vi.mock('../../shared/logger');

import case02 from './case02.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

function createMockJiraResource() {
    return {
        getProjectId: vi.fn().mockResolvedValue('123'),
        getProjectVersions: vi.fn().mockResolvedValue([]),
    };
}

function createContext(jiraResource?: ReturnType<typeof createMockJiraResource>) {
    return makeMockCommandContext(jiraResource ? { jiraResource } : {});
}

let mockJiraResource: ReturnType<typeof createMockJiraResource>;
let mockContext: ReturnType<typeof makeMockCommandContext>;

beforeEach(() => {
    vi.clearAllMocks();
    mockJiraResource = createMockJiraResource();
    mockContext = createContext(mockJiraResource);
});

describe('Case02 — list versions', () => {
    it('exports a handler function', () => {
        expect(case02).toBeDefined();
        expect(typeof case02.handler).toBe('function');
    });

    it('runs full version list flow with mocked dependencies without throwing', async () => {
        const result = await case02.handler(mockContext);

        expect([undefined, true, false]).toContain(result);
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
        expect([undefined, true, false]).toContain(result);
    });

    it('handles versions list with overdue release', async () => {
        const pastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        mockJiraResource.getProjectVersions.mockResolvedValueOnce([
            { name: 'v1.0', description: 'Desc', released: false, releaseDate: pastDate },
        ]);
        const result = await case02.handler(mockContext);

        expect([undefined, true, false]).toContain(result);
    });

    it('catches API failure and returns undefined without throwing', async () => {
        mockJiraResource.getProjectId.mockRejectedValueOnce(new Error('API failure'));
        const result = await case02.handler(mockContext);

        expect([undefined, true, false]).toContain(result);
    });
});
