vi.mock('../shared/logger', () => ({
    rootLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('fs');

import fs from 'fs';
import type { Mock } from 'vitest';
import path from 'path';
import { LinkTypeManager } from './link-types.js';
import { rootLogger } from '../shared/logger.js';
import { tempDirPath } from '../shared/temp-dir.js';

const rootLoggerWarnSpy = vi.spyOn(rootLogger, 'warn');
import { nonNull } from '../shared/test-utils.js';

const CACHE_PATH = path.join(tempDirPath(), 'cache', 'link-types-cache.json');

describe('LinkTypeManager', () => {
    let manager: LinkTypeManager;
    let mockJiraResource: {
        getJiraResource: Mock;
        postJiraResource: Mock;
        putJiraResource: Mock;
        searchJiraIssues: Mock;
        getTransitionsForIssue: Mock;
        transitionIssue: Mock;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockJiraResource = {
            getJiraResource: vi.fn(),
            postJiraResource: vi.fn(),
            putJiraResource: vi.fn(),
            searchJiraIssues: vi.fn(),
            getTransitionsForIssue: vi.fn(),
            transitionIssue: vi.fn(),
        };
        manager = new LinkTypeManager(mockJiraResource);
    });

    describe('Constructor', () => {
        it('stores jiraResource and sets defaults', () => {
            expect(manager.jiraResource).toBe(mockJiraResource);
            expect(manager.linkTypesCache).toBeNull();
            expect(manager.cacheFilePath).toBe(CACHE_PATH);
        });
    });

    describe('GetIssueLinkTypes', () => {
        it('returns cached value on second call', async () => {
            expect.hasAssertions();

            const fakeTypes = [{ id: '1', name: 'Test' }];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
            const first = await manager.getIssueLinkTypes();
            const second = await manager.getIssueLinkTypes();

            expect(first).toBe(fakeTypes);
            expect(second).toBe(fakeTypes);
            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
        });

        it('fetches from API and caches to disk', async () => {
            expect.hasAssertions();

            const fakeTypes = [{ id: '10200', name: 'Tested by' }];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
            await manager.getIssueLinkTypes();

            expect(fs.writeFileSync).toHaveBeenCalledWith(CACHE_PATH, JSON.stringify(fakeTypes), 'utf8');
        });

        it('falls back to local cache when API fails', async () => {
            expect.hasAssertions();

            const cachedTypes = [{ id: '99', name: 'Cached' }];
            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API down'));
            vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(cachedTypes));
            const result = await manager.getIssueLinkTypes();

            expect(result).toStrictEqual(cachedTypes);
        });

        it('falls back to hardcoded types when API and cache fail', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API down'));
            vi.spyOn(fs, 'existsSync').mockReturnValue(false);
            const result = await manager.getIssueLinkTypes();

            expect(result).toHaveLength(3);
            expect(nonNull(result[0]).name).toBe('Relates');
        });

        it('logs warning when cache write throws', async () => {
            expect.hasAssertions();

            const fakeTypes = [{ id: '10200', name: 'Tested by' }];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
            vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
                throw new Error('Disk full');
            });
            await manager.getIssueLinkTypes();

            expect(rootLoggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Falha ao escrever cache'));
        });

        it('logs warning when cache read has invalid JSON', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API down'));
            vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            vi.spyOn(fs, 'readFileSync').mockReturnValue('invalid json');
            const result = await manager.getIssueLinkTypes();

            expect(rootLoggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Falha ao ler cache'));
            expect(result).toHaveLength(3);
            expect(nonNull(result[0]).name).toBe('Relates');
        });
    });

    describe('ResolveLinkTypeId', () => {
        beforeEach(() => {
            const fakeTypes = [
                { id: '100', name: 'Relates', inward: 'relates to', outward: 'relates to' },
                { id: '200', name: 'Tests', inward: 'is tested by', outward: 'tests' },
            ];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
        });

        it('matches by name', async () => {
            expect.hasAssertions();

            const id = await manager.resolveLinkTypeId('Tests');

            expect(id).toBe('200');
        });

        it('matches by inward', async () => {
            expect.hasAssertions();

            const id = await manager.resolveLinkTypeId('is tested by');

            expect(id).toBe('200');
        });

        it('matches by outward', async () => {
            expect.hasAssertions();

            const id = await manager.resolveLinkTypeId('tests');

            expect(id).toBe('200');
        });

        it('is case insensitive', async () => {
            expect.hasAssertions();

            const id = await manager.resolveLinkTypeId('TESTS');

            expect(id).toBe('200');
        });

        it('trims whitespace', async () => {
            expect.hasAssertions();

            const id = await manager.resolveLinkTypeId('  Tests  ');

            expect(id).toBe('200');
        });

        it('throws when no match found', async () => {
            expect.hasAssertions();

            await expect(manager.resolveLinkTypeId('nonexistent')).rejects.toThrow(/não encontrado/);
        });
    });
});
