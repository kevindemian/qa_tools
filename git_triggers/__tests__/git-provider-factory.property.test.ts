import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fc } from '../../shared/deps.js';
import type { CiEnvironment } from '../git-provider-factory.js';
import { createGitProvider } from '../git-provider-factory.js';

vi.mock('../gitlab_manager.js', () => {
    const MockGitLab = vi.fn().mockImplementation(function MockGitLab(id: string, token: string, baseUrl: string) {
        return { provider: 'gitlab', projectId: id, token, baseUrl };
    });
    return { default: MockGitLab };
});

vi.mock('../github_manager.js', () => {
    const MockGitHub = vi.fn().mockImplementation(function MockGitHub(repo: string, token: string) {
        return { provider: 'github', repo, token };
    });
    return { default: MockGitHub };
});

function makeCiEnv(overrides: Partial<CiEnvironment> = {}): CiEnvironment {
    return {
        isCI: true,
        repo: 'owner/repo',
        branch: 'main',
        commit: 'abc123',
        runId: '1',
        runUrl: 'https://example.com',
        isPullRequest: false,
        ...overrides,
    };
}

describe('CreateGitProvider — property-based', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env['CI_JOB_TOKEN'];
        delete process.env['CI_PROJECT_ID'];
        delete process.env['GITHUB_TOKEN'];
        delete process.env['CI_SERVER_URL'];
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('output is always GitProvider | undefined (never synchronous non-Promise)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.boolean(), (isCI) => {
                const result = createGitProvider(makeCiEnv({ isCI }));

                expect(result).not.toBeInstanceOf(Promise);
            }),
            { numRuns: 100 },
        );
    });

    it('isCI=false always returns undefined', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string(), fc.string(), (token, projectId) => {
                process.env['CI_JOB_TOKEN'] = token;
                process.env['CI_PROJECT_ID'] = projectId;
                const result = createGitProvider(makeCiEnv({ isCI: false }));

                expect(result).toBeUndefined();
            }),
            { numRuns: 100 },
        );
    });

    it('isCI=true with valid GitLab env always returns object with provider=gitlab', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (token, projectId) => {
                process.env['CI_JOB_TOKEN'] = token;
                process.env['CI_PROJECT_ID'] = projectId;
                const result = createGitProvider(makeCiEnv());

                expect(result).toBeDefined();
                expect(result).toHaveProperty('provider', 'gitlab');
            }),
            { numRuns: 100 },
        );
    });

    it('isCI=true with valid GitHub env always returns object with provider=github', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 1 }), (token) => {
                process.env['GITHUB_TOKEN'] = token;
                const result = createGitProvider(makeCiEnv());

                expect(result).toBeDefined();
                expect(result).toHaveProperty('provider', 'github');
            }),
            { numRuns: 100 },
        );
    });
});
