import { jest } from '@jest/globals';
import { createMockGitProvider } from './git-provider-factory';

describe('createMockGitProvider', () => {
    it('returns a jest.Mocked<GitProvider> with all methods as jest.fn()', () => {
        const mock = createMockGitProvider();

        expect(typeof mock.triggerPipeline).toBe('function');
        expect(typeof mock.getSchedules).toBe('function');
        expect(typeof mock.runSchedule).toBe('function');
        expect(typeof mock.createMergeRequest).toBe('function');
        expect(typeof mock.updateMergeRequest).toBe('function');
        expect(typeof mock.getMergeRequest).toBe('function');
        expect(typeof mock.searchMergeRequests).toBe('function');
        expect(typeof mock.acceptMergeRequest).toBe('function');
        expect(typeof mock.isApproved).toBe('function');
        expect(typeof mock.getCICDVariables).toBe('function');
        expect(typeof mock.getRecentPipelines).toBe('function');
        expect(typeof mock.getBranch).toBe('function');
        expect(typeof mock.getPipeline).toBe('function');
        expect(typeof mock.getPipelineJobs).toBe('function');
        expect(typeof mock.listPipelineArtifacts).toBe('function');
        expect(typeof mock.downloadArtifact).toBe('function');
        expect(typeof mock.getDiff).toBe('function');
    });

    it('defaults provider to gitlab', () => {
        const mock = createMockGitProvider();
        expect(mock.provider).toBe('gitlab');
    });

    it('merges overrides correctly', () => {
        const customPipeline = jest.fn(() => Promise.resolve({ id: 42 }));
        const mock = createMockGitProvider({ triggerPipeline: customPipeline });

        expect(mock.triggerPipeline).toBe(customPipeline);
    });

    it('each call produces independent jest.fn() instances', () => {
        const a = createMockGitProvider();
        const b = createMockGitProvider();
        expect(a.triggerPipeline).not.toBe(b.triggerPipeline);
    });
});
