import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHttpClient } from './http-client.js';

vi.mock('./http-client', () => ({
    createHttpClient: vi.fn(),
}));

vi.mock('./config', () => ({
    default: {
        get: vi.fn((key: string) => {
            if (key === 'githubToken') return 'gh_token_abc';
            if (key === 'GITHUB_REPOSITORY') return 'owner/repo';
            if (key === 'CI_JOB_TOKEN') return '';
            if (key === 'CI_PROJECT_ID') return '';
            return undefined;
        }),
        getDefault: vi.fn(() => ({
            get: vi.fn((key: string) => {
                if (key === 'githubToken') return 'gh_token_abc';
                return undefined;
            }),
        })),
    },
}));

vi.mock('./logger', () => ({
    rootLogger: { warn: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn() }) },
}));

vi.mock('./deps', () => ({
    AdmZip: class {
        entries: Array<{ name: string; getData: () => Buffer }>;
        constructor(data: Buffer) {
            this.entries = [{ name: 'ctrf.json', getData: () => data }];
        }
        getEntries() {
            return this.entries;
        }
    },
}));

const CTRF_SAMPLE = {
    reportFormat: 'CTRF',
    specVersion: '1.0',
    results: {
        summary: { tests: 2, passed: 1, failed: 1, skipped: 0 },
        tests: [
            { name: 'Passing test', status: 'passed', duration: 100 },
            { name: 'Failing test', status: 'failed', duration: 200, message: 'Assertion failed' },
        ],
    },
};

describe('FetchLatestTestRun', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves GitHub run with CTRF artifact and returns ParseResult', async () => {expect.hasAssertions();

        const mockGet = vi.fn();
        mockGet
            .mockResolvedValueOnce({
                data: { workflow_runs: [{ id: 123, created_at: '2026-06-01T00:00:00Z' }] },
            })
            .mockResolvedValueOnce({
                data: { artifacts: [{ id: 456, name: 'ctrf-report' }] },
            })
            .mockResolvedValueOnce({
                data: Buffer.from(JSON.stringify(CTRF_SAMPLE)),
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).not.toBeNull();

        if (!result) throw new Error('expected non-null result');

        expect(result.tests).toHaveLength(2);
        expect(result.stats.passed).toBe(1);
        expect(result.stats.failed).toBe(1);
        expect(result.stats.total).toBe(2);
    });

    it('returns null when no runs found', async () => {expect.hasAssertions();

        const mockGet = vi.fn().mockResolvedValueOnce({
            data: { workflow_runs: [] },
        });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });

    it('returns null when no CTRF artifact in latest run', async () => {expect.hasAssertions();

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({
                data: { workflow_runs: [{ id: 123, created_at: '2026-06-01T00:00:00Z' }] },
            })
            .mockResolvedValueOnce({
                data: { artifacts: [{ id: 789, name: 'coverage-report' }] },
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });

    it('returns null when CI returns no runs', async () => {expect.hasAssertions();

        const mockGet = vi.fn().mockResolvedValueOnce({
            data: { workflow_runs: [] },
        });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });
});

describe('FetchLatestTestRun — GitLab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('downloads and parses GitLab pipeline artifact', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            if (key === 'CI_PROJECT_ID') return '12345';
            if (key === 'CI_SERVER_URL') return 'https://gitlab.example.com';
            return undefined;
        });

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({ data: [{ id: 789, created_at: '2026-06-01T00:00:00Z' }] })
            .mockResolvedValueOnce({ data: [{ id: 111, name: 'test-job', stage: 'test' }] })
            .mockResolvedValueOnce({ data: Buffer.from(JSON.stringify(CTRF_SAMPLE)) });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).not.toBeNull();

        if (!result) throw new Error('expected non-null result');

        expect(result.tests).toHaveLength(2);
        expect(result.stats.passed).toBe(1);
        expect(result.stats.failed).toBe(1);
    });

    it('returns null when GitLab pipeline has no jobs', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            if (key === 'CI_PROJECT_ID') return '12345';
            return undefined;
        });

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({ data: [{ id: 789, created_at: '2026-06-01T00:00:00Z' }] })
            .mockResolvedValueOnce({ data: [] });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });

    it('returns null when GitLab has no pipelines', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            if (key === 'CI_PROJECT_ID') return '12345';
            return undefined;
        });

        const mockGet = vi.fn().mockResolvedValueOnce({ data: [] });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });

    it('handles GitLab API error gracefully', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            if (key === 'CI_PROJECT_ID') return '12345';
            return undefined;
        });

        const mockGet = vi.fn().mockRejectedValueOnce(new Error('API error'));
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });
});

describe('FetchLatestTestRun — no CI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when no CI is configured', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockReturnValue(undefined);
        vi.spyOn(cfg, 'getDefault').mockReturnValue({
            get: vi.fn(() => undefined),
        } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });

    it('returns null when GitHub ZIP entry has zero total', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'githubToken') return 'gh_token_abc';
            if (key === 'GITHUB_REPOSITORY') return 'owner/repo';
            return undefined;
        });
        vi.spyOn(cfg, 'getDefault').mockReturnValue({
            get: vi.fn((key: string) => {
                if (key === 'githubToken') return 'gh_token_abc';
                return undefined;
            }),
        } as never);

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({
                data: { workflow_runs: [{ id: 1, created_at: '2026-06-01T00:00:00Z' }] },
            })
            .mockResolvedValueOnce({
                data: { artifacts: [{ id: 10, name: 'ctrf-report' }] },
            })
            .mockResolvedValueOnce({
                data: Buffer.from(
                    JSON.stringify({
                        results: { summary: { tests: 0, passed: 0, failed: 0, skipped: 0 }, tests: [] },
                    }),
                ),
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });

    it('handles GitHub download API error gracefully', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'githubToken') return 'gh_token_abc';
            if (key === 'GITHUB_REPOSITORY') return 'owner/repo';
            return undefined;
        });
        vi.spyOn(cfg, 'getDefault').mockReturnValue({
            get: vi.fn((key: string) => {
                if (key === 'githubToken') return 'gh_token_abc';
                return undefined;
            }),
        } as never);

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({
                data: { workflow_runs: [{ id: 1, created_at: '2026-06-01T00:00:00Z' }] },
            })
            .mockResolvedValueOnce({
                data: { artifacts: [{ id: 10, name: 'ctrf-report' }] },
            })
            .mockRejectedValueOnce(new Error('Download failed'));
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });

    it('returns null when GitLab ZIP entry has zero total', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            if (key === 'CI_PROJECT_ID') return '12345';
            if (key === 'CI_SERVER_URL') return 'https://gitlab.example.com';
            return undefined;
        });

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({ data: [{ id: 789, created_at: '2026-06-01T00:00:00Z' }] })
            .mockResolvedValueOnce({ data: [{ id: 111, name: 'test-job', stage: 'test' }] })
            .mockResolvedValueOnce({
                data: Buffer.from(
                    JSON.stringify({
                        results: { summary: { tests: 0, passed: 0, failed: 0, skipped: 0 }, tests: [] },
                    }),
                ),
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });

    it('handles GitLab download API error gracefully', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            if (key === 'CI_PROJECT_ID') return '12345';
            if (key === 'CI_SERVER_URL') return 'https://gitlab.example.com';
            return undefined;
        });

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({ data: [{ id: 789, created_at: '2026-06-01T00:00:00Z' }] })
            .mockRejectedValueOnce(new Error('Jobs fetch failed'));
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchLatestTestRun } = await import('./git-artifact-downloader.js');
        const result = await fetchLatestTestRun();

        expect(result).toBeNull();
    });
});

describe('FetchGitHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty context when no CI configured', async () => {expect.hasAssertions();

        vi.mocked(createHttpClient).mockReturnValue({ get: vi.fn() } as never);

        const { fetchGitHistory } = await import('./git-artifact-downloader.js');
        const result = await fetchGitHistory();

        expect(result).toStrictEqual({ commits: '', runs: [], flakyTests: '' });
    });

    it('returns history with runs and flaky tests for GitHub', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'githubToken') return 'gh_token_abc';
            if (key === 'GITHUB_REPOSITORY') return 'owner/repo';
            return undefined;
        });
        vi.spyOn(cfg, 'getDefault').mockReturnValue({
            get: vi.fn((key: string) => {
                if (key === 'githubToken') return 'gh_token_abc';
                return undefined;
            }),
        } as never);

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({
                data: {
                    workflow_runs: [
                        {
                            id: 1,
                            created_at: '2026-06-01T00:00:00Z',
                            head_commit: { message: 'Fix test\nDetails', author: { name: 'dev1' } },
                        },
                        {
                            id: 2,
                            created_at: '2026-06-02T00:00:00Z',
                            head_commit: { message: 'Add feature', author: { name: 'dev2' } },
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: { artifacts: [{ id: 10, name: 'ctrf-report' }] },
            })
            .mockResolvedValueOnce({
                data: Buffer.from(
                    JSON.stringify({
                        results: {
                            summary: { tests: 2, passed: 1, failed: 1, skipped: 0 },
                            tests: [
                                { name: 'FlakyTest A', status: 'passed', duration: 100 },
                                { name: 'FlakyTest B', status: 'failed', duration: 200 },
                            ],
                        },
                    }),
                ),
            })
            .mockResolvedValueOnce({
                data: { artifacts: [{ id: 20, name: 'ctrf-report' }] },
            })
            .mockResolvedValueOnce({
                data: Buffer.from(
                    JSON.stringify({
                        results: {
                            summary: { tests: 2, passed: 2, failed: 0, skipped: 0 },
                            tests: [
                                { name: 'FlakyTest A', status: 'failed', duration: 100 },
                                { name: 'StableTest', status: 'passed', duration: 150 },
                            ],
                        },
                    }),
                ),
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchGitHistory } = await import('./git-artifact-downloader.js');
        const result = await fetchGitHistory();

        expect(result.commits).toContain('Fix test');
        expect(result.commits).toContain('Add feature');
        expect(result.runs.length).toBeGreaterThanOrEqual(1);
        expect(result.flakyTests).toContain('FlakyTest A');
    });

    it('handles GitHub history API error gracefully', async () => {expect.hasAssertions();

        const mockGet = vi.fn().mockRejectedValueOnce(new Error('Network error'));
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchGitHistory } = await import('./git-artifact-downloader.js');
        const result = await fetchGitHistory();

        expect(result).toStrictEqual({ commits: '', runs: [], flakyTests: '' });
    });

    it('handles runs without head_commit in buildCommitsFromRuns', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'githubToken') return 'gh_token_abc';
            if (key === 'GITHUB_REPOSITORY') return 'owner/repo';
            return undefined;
        });
        vi.spyOn(cfg, 'getDefault').mockReturnValue({
            get: vi.fn((key: string) => {
                if (key === 'githubToken') return 'gh_token_abc';
                return undefined;
            }),
        } as never);

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({
                data: {
                    workflow_runs: [
                        {
                            id: 1,
                            created_at: '2026-06-01T00:00:00Z',
                            head_commit: null,
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: { artifacts: [] },
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchGitHistory } = await import('./git-artifact-downloader.js');
        const result = await fetchGitHistory();

        expect(result.commits).toBe('');
    });

    it('filters out non-JSON entries in processGitHubArtifacts', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'githubToken') return 'gh_token_abc';
            if (key === 'GITHUB_REPOSITORY') return 'owner/repo';
            return undefined;
        });
        vi.spyOn(cfg, 'getDefault').mockReturnValue({
            get: vi.fn((key: string) => {
                if (key === 'githubToken') return 'gh_token_abc';
                return undefined;
            }),
        } as never);

        const { AdmZip: MockZip } = await import('./deps.js');
        const mockEntries = [
            { name: 'readme.txt', getData: () => Buffer.from('not json') },
            {
                name: 'results.json',
                getData: () =>
                    Buffer.from(
                        JSON.stringify({
                            results: {
                                summary: { tests: 1, passed: 1, failed: 0, skipped: 0 },
                                tests: [{ name: 'OK', status: 'passed', duration: 10 }],
                            },
                        }),
                    ),
            },
        ];
        Object.defineProperty(MockZip.prototype, 'getEntries', {
            value: () => mockEntries,
            writable: true,
            configurable: true,
        });

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({
                data: {
                    workflow_runs: [
                        {
                            id: 1,
                            created_at: '2026-06-01T00:00:00Z',
                            head_commit: { message: 'test', author: { name: 'dev' } },
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: { artifacts: [{ id: 1, name: 'ctrf-report' }] },
            })
            .mockResolvedValueOnce({
                data: Buffer.from('dummy zip data'),
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchGitHistory } = await import('./git-artifact-downloader.js');
        const result = await fetchGitHistory();

        expect(result.runs).toHaveLength(1);
    });

    it('returns GitLab history via fetchGitHistory', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            if (key === 'CI_PROJECT_ID') return '12345';
            if (key === 'CI_SERVER_URL') return 'https://gitlab.example.com';
            return undefined;
        });

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({
                data: [
                    { id: 789, created_at: '2026-06-01T00:00:00Z' },
                    { id: 790, created_at: '2026-06-02T00:00:00Z' },
                ],
            })
            .mockResolvedValueOnce({
                data: [{ id: 111, name: 'test-job', stage: 'test' }],
            })
            .mockResolvedValueOnce({
                data: Buffer.from(
                    JSON.stringify({
                        results: {
                            summary: { tests: 1, passed: 1, failed: 0, skipped: 0 },
                            tests: [{ name: 'OK', status: 'passed' }],
                        },
                    }),
                ),
            })
            .mockResolvedValueOnce({
                data: [{ id: 112, name: 'test-job', stage: 'test' }],
            })
            .mockResolvedValueOnce({
                data: Buffer.from(
                    JSON.stringify({
                        results: { summary: { tests: 0, passed: 0, failed: 0, skipped: 0 }, tests: [] },
                    }),
                ),
            });
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchGitHistory } = await import('./git-artifact-downloader.js');
        const result = await fetchGitHistory();

        expect(result.runs).toHaveLength(2);
    });

    it('handles GitLab pipeline processing error in fetchGitHistory', async () => {expect.hasAssertions();

        const cfg = (await import('./config.js')).default;
        vi.spyOn(cfg, 'get').mockImplementation((key: string) => {
            if (key === 'CI_JOB_TOKEN') return 'gl_token_xyz';
            if (key === 'CI_PROJECT_ID') return '12345';
            if (key === 'CI_SERVER_URL') return 'https://gitlab.example.com';
            return undefined;
        });

        const mockGet = vi
            .fn()
            .mockResolvedValueOnce({
                data: [{ id: 789, created_at: '2026-06-01T00:00:00Z' }],
            })
            .mockRejectedValueOnce(new Error('Pipeline processing failed'));
        vi.mocked(createHttpClient).mockReturnValue({ get: mockGet } as never);

        const { fetchGitHistory } = await import('./git-artifact-downloader.js');
        const result = await fetchGitHistory();

        expect(result.runs).toStrictEqual([]);
    });
});

describe('Ci helpers', () => {
    it('exports isGitHubCi and isGitLabCi from ci-detect', async () => {expect.hasAssertions();

        const mod = await import('./git-artifact-downloader.js');

        expect(mod.isGitHubCi).toBeDefined();
        expect(mod.isGitLabCi).toBeDefined();
    });

    it('exports GIT_HISTORY_RUNS constant', async () => {expect.hasAssertions();

        const mod = await import('./git-artifact-downloader.js');

        expect(mod.GIT_HISTORY_RUNS).toBe(5);
    });
});
