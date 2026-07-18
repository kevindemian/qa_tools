vi.mock('../../../shared/ui/prompt.js');
vi.mock('../../../shared/logger');

import { describe, it, expect, vi, beforeEach } from 'vitest';
import case02 from '../case02.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import * as promptModule from '../../../shared/ui/prompt.js';

const mockInfo = vi.mocked(promptModule.info);
const mockDivider = vi.mocked(promptModule.divider);
const mockPrintError = vi.mocked(promptModule.printError);

function makeMockJiraResource() {
    return {
        getProjectId: vi.fn().mockResolvedValue('123'),
        getProjectVersions: vi.fn().mockResolvedValue([]),
    };
}

function makeContext(jiraResource: ReturnType<typeof makeMockJiraResource>) {
    return makeMockCommandContext({ jiraResource });
}

describe('Case02.Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('FT-42a: empty version list', () => {
        it('shows info when no versions exist', async () => {
            expect.hasAssertions();

            const jira = makeMockJiraResource();
            jira.getProjectVersions.mockResolvedValue([]);
            const ctx = makeContext(jira);
            await case02.handler(ctx);

            expect(mockInfo).toHaveBeenCalledWith('Nenhuma versão encontrada para esse projeto.');
            expect(mockDivider).not.toHaveBeenCalled();
        });

        it('shows info when versions is null', async () => {
            expect.hasAssertions();

            const jira = makeMockJiraResource();
            jira.getProjectVersions.mockResolvedValue(null);
            const ctx = makeContext(jira);
            await case02.handler(ctx);

            expect(mockInfo).toHaveBeenCalledWith('Nenhuma versão encontrada para esse projeto.');
        });
    });

    describe('FT-42b: version display formatting', () => {
        it('marks released versions', async () => {
            expect.hasAssertions();

            const jira = makeMockJiraResource();
            jira.getProjectVersions.mockResolvedValue([{ name: 'v1.0', description: 'First', released: true }]);
            const ctx = makeContext(jira);
            await case02.handler(ctx);

            expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('(RELEASED)'));
        });

        it('shows placeholder when description is empty', async () => {
            expect.hasAssertions();

            const jira = makeMockJiraResource();
            jira.getProjectVersions.mockResolvedValue([{ name: 'v2.0', description: '', released: false }]);
            const ctx = makeContext(jira);
            await case02.handler(ctx);

            expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('sem descrição'));
        });

        it('does not mark unreleased future version as overdue', async () => {
            expect.hasAssertions();

            const futureDate = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
            const jira = makeMockJiraResource();
            jira.getProjectVersions.mockResolvedValue([
                { name: 'v3.0', description: 'Future', released: false, releaseDate: futureDate },
            ]);
            const ctx = makeContext(jira);
            await case02.handler(ctx);

            expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('ATRASADA'));
        });

        it('marks unreleased past version as overdue', async () => {
            expect.hasAssertions();

            const pastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            const jira = makeMockJiraResource();
            jira.getProjectVersions.mockResolvedValue([
                { name: 'v0.5', description: 'Late', released: false, releaseDate: pastDate },
            ]);
            const ctx = makeContext(jira);
            await case02.handler(ctx);

            expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('ATRASADA'));
        });
    });

    describe('FT-42c: pushHistory on success', () => {
        it('calls pushHistory with version count', async () => {
            expect.hasAssertions();

            const jira = makeMockJiraResource();
            jira.getProjectVersions.mockResolvedValue([
                { name: 'v1', description: 'A', released: true },
                { name: 'v2', description: 'B', released: false },
            ]);
            const ctx = makeContext(jira);
            await case02.handler(ctx);

            expect(ctx.pushHistory).toHaveBeenCalledWith('listar-versoes', '2 versão(oes)', 'ok');
        });
    });

    describe('FT-42d: error handling', () => {
        it('catches getProjectId failure and calls printError', async () => {
            expect.hasAssertions();

            const jira = makeMockJiraResource();
            jira.getProjectId.mockRejectedValue(new Error('API error'));
            const ctx = makeContext(jira);

            await expect(case02.handler(ctx)).resolves.toBeUndefined();
            expect(mockPrintError).toHaveBeenCalledWith('Erro ao listar versões', expect.any(Error));
        });

        it('catches getProjectVersions failure and calls printError', async () => {
            expect.hasAssertions();

            const jira = makeMockJiraResource();
            jira.getProjectId.mockResolvedValue('123');
            jira.getProjectVersions.mockRejectedValue(new Error('List error'));
            const ctx = makeContext(jira);

            await expect(case02.handler(ctx)).resolves.toBeUndefined();
            expect(mockPrintError).toHaveBeenCalledWith('Erro ao listar versões', expect.any(Error));
        });
    });
});
