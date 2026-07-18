import { createMockGitProvider } from '../git-provider-factory.js';

const GIT_PROVIDER_METHODS = [
    'triggerPipeline',
    'getSchedules',
    'runSchedule',
    'createMergeRequest',
    'updateMergeRequest',
    'getMergeRequest',
    'searchMergeRequests',
    'acceptMergeRequest',
    'isApproved',
    'getCICDVariables',
    'getRecentPipelines',
    'getBranch',
    'getPipeline',
    'getPipelineJobs',
    'listPipelineArtifacts',
    'downloadArtifact',
    'getDiff',
];

describe('CreateMockGitProvider', () => {
    it('returns a Mocked<GitProvider> with all methods as vi.fn()', () => {
        const mock = createMockGitProvider();

        expect(GIT_PROVIDER_METHODS.every((m) => typeof mock[m as keyof typeof mock] === 'function')).toBeTruthy();
    });

    it('defaults provider to gitlab', () => {
        const mock = createMockGitProvider();

        expect(mock.provider).toBe('gitlab');
    });

    it('merges overrides correctly', () => {
        const customPipeline = vi.fn(() => Promise.resolve({ id: 42 }));
        const mock = createMockGitProvider({ triggerPipeline: customPipeline });

        expect(mock.triggerPipeline).toBe(customPipeline);
    });

    it('each call produces independent vi.fn() instances', () => {
        const a = createMockGitProvider();
        const b = createMockGitProvider();

        expect(a.triggerPipeline).not.toBe(b.triggerPipeline);
    });
});
