import { createHttpClient } from '../../shared/infra/http-client.js';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';

vi.mock('../../shared/infra/http-client.js', () => ({ createHttpClient: vi.fn() }));

vi.mock('../../shared/logger', () => ({
    Logger: vi.fn(function () {
        return {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            child: vi.fn(function () {
                return { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
            }),
        };
    }),
    rootLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../shared/ui/prompt.js', () => ({
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    extractErrorMessage: vi.fn().mockReturnValue('mocked error'),
    ProgressBar: vi.fn(() => ({
        update: vi.fn(),
        stop: vi.fn(),
        current: 0,
        total: 0,
        startTime: Date.now(),
        width: 20,
    })),
}));

import JiraResource from '../jira_resource.js';
import { getProjectId, getVersionId, getProjectVersions, getLatestReleases } from '../jira-resource-version.js';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();

function buildResource(): JiraResource {
    vi.mocked(createHttpClient).mockReturnValue(
        createMockAxiosInstance({ get: mockGet, post: mockPost, put: mockPut }),
    );
    return new JiraResource('test-token', 'https://test-jira.com');
}

describe('Jira Resource Version', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GetProjectId', () => {
        it('returns project id on success', async () => {
            expect.hasAssertions();

            mockGet.mockResolvedValue({ data: { id: '10000' } });
            const resource = buildResource();
            const result = await getProjectId(resource, 'TEST');

            expect(result).toBe('10000');
        });

        it('returns empty string on error', async () => {
            expect.hasAssertions();

            mockGet.mockRejectedValue(new Error('Not found'));
            const resource = buildResource();
            const result = await getProjectId(resource, 'NOPE');

            expect(result).toBe('');
        });
    });

    describe('GetProjectVersions', () => {
        it('returns versions on success', async () => {
            expect.hasAssertions();

            mockGet.mockResolvedValue({
                data: [
                    { id: '1', name: 'v1' },
                    { id: '2', name: 'v2' },
                ],
            });
            const resource = buildResource();
            const versions = await getProjectVersions(resource, '10000');

            expect(versions).toHaveLength(2);
        });

        it('returns empty array on network error', async () => {
            expect.hasAssertions();

            mockGet.mockRejectedValue(new Error('Network error'));
            const resource = buildResource();
            const versions = await getProjectVersions(resource, '10000');

            expect(versions).toStrictEqual([]);
        });
    });

    describe('GetVersionId', () => {
        it('returns version id when found', async () => {
            expect.hasAssertions();

            const resource = buildResource();
            vi.spyOn(resource, 'getProjectId').mockResolvedValue('10000');
            vi.spyOn(resource, 'getProjectVersions').mockResolvedValue([{ id: '99', name: 'v1.0' }]);
            const id = await getVersionId(resource, 'TEST', 'v1.0');

            expect(id).toBe('99');
        });

        it('returns null when no project', async () => {
            expect.hasAssertions();

            const resource = buildResource();
            vi.spyOn(resource, 'getProjectId').mockResolvedValue('');
            const id = await getVersionId(resource, 'TEST', 'v1.0');

            expect(id).toBeNull();
        });
    });

    describe('GetLatestReleases', () => {
        it('returns empty when project not found', async () => {
            expect.hasAssertions();

            const resource = buildResource();
            vi.spyOn(resource, 'getProjectId').mockResolvedValue('');
            const result = await getLatestReleases(resource, 'NOPE', 3);

            expect(result.latestReleasedVersions).toStrictEqual([]);
            expect(result.unreleasedVersions).toStrictEqual([]);
        });
    });
});
