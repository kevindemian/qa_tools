jest.mock('../shared/logger', () => ({
    rootLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('fs');

import fs from 'fs';
import path from 'path';
import type { JiraResourceLike } from '../shared/types';
import { LinkTypeManager } from './link-types';
import { rootLogger } from '../shared/logger';
import { tempDirPath } from '../shared/temp-dir';

const CACHE_PATH = path.join(tempDirPath(), 'cache', 'link-types-cache.json');

describe('LinkTypeManager', () => {
    let manager: LinkTypeManager;
    let mockJiraResource: {
        getJiraResource: jest.Mock;
        postJiraResource: jest.Mock;
        putJiraResource: jest.Mock;
        searchJiraIssues: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockJiraResource = {
            getJiraResource: jest.fn(),
            postJiraResource: jest.fn(),
            putJiraResource: jest.fn(),
            searchJiraIssues: jest.fn(),
        };
        manager = new LinkTypeManager(mockJiraResource as unknown as JiraResourceLike);
    });

    describe('constructor', () => {
        it('stores jiraResource and sets defaults', () => {
            expect(manager.jiraResource).toBe(mockJiraResource);
            expect(manager.linkTypesCache).toBeNull();
            expect(manager.cacheFilePath).toBe(CACHE_PATH);
        });
    });

    describe('getIssueLinkTypes', () => {
        it('returns cached value on second call', async () => {
            const fakeTypes = [{ id: '1', name: 'Test' }];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
            const first = await manager.getIssueLinkTypes();
            const second = await manager.getIssueLinkTypes();
            expect(first).toBe(fakeTypes);
            expect(second).toBe(fakeTypes);
            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
        });

        it('fetches from API and caches to disk', async () => {
            const fakeTypes = [{ id: '10200', name: 'Tested by' }];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
            await manager.getIssueLinkTypes();
            expect(fs.writeFileSync).toHaveBeenCalledWith(CACHE_PATH, JSON.stringify(fakeTypes), 'utf8');
        });

        it('falls back to local cache when API fails', async () => {
            const cachedTypes = [{ id: '99', name: 'Cached' }];
            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API down'));
            jest.mocked(fs.existsSync).mockReturnValue(true);
            jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cachedTypes));
            const result = await manager.getIssueLinkTypes();
            expect(result).toEqual(cachedTypes);
        });

        it('falls back to hardcoded types when API and cache fail', async () => {
            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API down'));
            jest.mocked(fs.existsSync).mockReturnValue(false);
            const result = await manager.getIssueLinkTypes();
            expect(result).toHaveLength(3);
            expect(result[0]!.name).toBe('Relates');
        });

        it('logs warning when cache write throws', async () => {
            const fakeTypes = [{ id: '10200', name: 'Tested by' }];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
            jest.mocked(fs.writeFileSync).mockImplementation(() => {
                throw new Error('Disk full');
            });
            await manager.getIssueLinkTypes();
            expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao escrever cache'));
        });

        it('logs warning when cache read has invalid JSON', async () => {
            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API down'));
            jest.mocked(fs.existsSync).mockReturnValue(true);
            jest.mocked(fs.readFileSync).mockReturnValue('invalid json');
            const result = await manager.getIssueLinkTypes();
            expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao ler cache'));
            expect(result).toHaveLength(3);
            expect(result[0]!.name).toBe('Relates');
        });
    });

    describe('resolveLinkTypeId', () => {
        beforeEach(() => {
            const fakeTypes = [
                { id: '100', name: 'Relates', inward: 'relates to', outward: 'relates to' },
                { id: '200', name: 'Tests', inward: 'is tested by', outward: 'tests' },
            ];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
        });

        it('matches by name', async () => {
            const id = await manager.resolveLinkTypeId('Tests');
            expect(id).toBe('200');
        });

        it('matches by inward', async () => {
            const id = await manager.resolveLinkTypeId('is tested by');
            expect(id).toBe('200');
        });

        it('matches by outward', async () => {
            const id = await manager.resolveLinkTypeId('tests');
            expect(id).toBe('200');
        });

        it('is case insensitive', async () => {
            const id = await manager.resolveLinkTypeId('TESTS');
            expect(id).toBe('200');
        });

        it('trims whitespace', async () => {
            const id = await manager.resolveLinkTypeId('  Tests  ');
            expect(id).toBe('200');
        });

        it('falls back to 11701 when no match', async () => {
            const id = await manager.resolveLinkTypeId('nonexistent');
            expect(id).toBe('11701');
        });
    });
});
