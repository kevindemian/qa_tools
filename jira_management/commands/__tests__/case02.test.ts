vi.mock('../../../shared/ui/prompt.js', () => ({
    info: vi.fn(),
    error: vi.fn(),
    divider: vi.fn(),
    printError: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    print: vi.fn(),
}));
vi.mock('../../../shared/logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import case02 from '../case02.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import * as promptModule from '../../../shared/ui/prompt.js';

function createMockJiraResource() {
    return {
        getProjectId: vi.fn().mockResolvedValue('123'),
        getProjectVersions: vi.fn().mockResolvedValue([]),
    };
}

function createContext(jiraResource?: ReturnType<typeof createMockJiraResource>) {
    return makeMockCommandContext(jiraResource ? { jiraResource } : {});
}

const mockInfo = vi.mocked(promptModule.info);
const mockError = vi.mocked(promptModule.error);
const mockPrintError = vi.mocked(promptModule.printError);

let mockJiraResource: ReturnType<typeof createMockJiraResource>;
let mockContext: ReturnType<typeof makeMockCommandContext>;

describe('Case02', () => {
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

        it('informs when no versions exist', async () => {
            expect.hasAssertions();

            mockJiraResource.getProjectVersions.mockResolvedValueOnce([]);
            await case02.handler(mockContext);

            expect(mockInfo).toHaveBeenCalledWith('Nenhuma versão encontrada para esse projeto.');
        });

        it('handles missing projectId gracefully', async () => {
            expect.hasAssertions();

            mockJiraResource.getProjectId.mockResolvedValueOnce(null);
            const result = await case02.handler(mockContext);

            expect(result).toBeUndefined();
            expect(mockError).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
        });

        it('lists versions and records history with count', async () => {
            expect.hasAssertions();

            mockJiraResource.getProjectVersions.mockResolvedValueOnce([
                { name: 'v1.0', description: 'First release', released: true },
                { name: 'v2.0', description: '', released: false, releaseDate: '2099-12-31' },
            ]);
            await case02.handler(mockContext);

            expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('v1.0'));
            expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('(RELEASED)'));
            expect(mockContext.pushHistory).toHaveBeenCalledWith('listar-versoes', '2 versão(oes)', 'ok');
        });

        it('flags overdue releases', async () => {
            expect.hasAssertions();

            const pastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            mockJiraResource.getProjectVersions.mockResolvedValueOnce([
                { name: 'v1.0', description: 'Desc', released: false, releaseDate: pastDate },
            ]);
            await case02.handler(mockContext);

            expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('(ATRASADA!)'));
            expect(mockContext.pushHistory).toHaveBeenCalledWith('listar-versoes', '1 versão(oes)', 'ok');
        });

        it('catches API failure and records error history', async () => {
            expect.hasAssertions();

            mockJiraResource.getProjectId.mockRejectedValueOnce(new Error('API failure'));
            const result = await case02.handler(mockContext);

            expect(result).toBeUndefined();
            expect(mockPrintError).toHaveBeenCalledWith(
                expect.stringContaining('Erro ao listar versões'),
                expect.any(Error),
            );
            expect(mockContext.pushHistory).toHaveBeenCalledWith('listar-versoes', 'erro', 'error');
        });
    });
});
