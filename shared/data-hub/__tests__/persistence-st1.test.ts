/**
 * ST-1 persistence tests — verify the 16 new category methods round-trip
 * through a StoreBackend and that missing files never return null (safeguard).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { StoreBackend } from '../../infra/store-backend.js';
import type {
    FailureRecord,
    SecurityFinding,
    Deployment,
    Release,
    DoraMetrics,
    RawIssue,
    CoverageFile,
    PerformanceMetrics,
} from '../../types/data-hub.js';
import { createDataHubPersistence } from '../persistence.js';

class MemoryBackend implements StoreBackend {
    private readonly store = new Map<string, Buffer>();

    init(): void {
        /* no-op for memory */
    }

    exists(relPath: string): boolean {
        return this.store.has(relPath);
    }

    read(relPath: string): Buffer | null {
        return this.store.get(relPath) ?? null;
    }

    write(relPath: string, data: Buffer): void {
        this.store.set(relPath, data);
    }

    flush(_message: string): void {
        /* no-op for memory */
    }
}

function makeHub() {
    const backend = new MemoryBackend();
    const persistence = createDataHubPersistence('st1-test', backend);
    return { backend, persistence };
}

const failureRecords: FailureRecord[] = [
    { name: 'auth.login fails', status: 'failed', message: 'boom', confidence: 1, source: 'junit' },
    { name: 'net.timeout', status: 'broken', confidence: 0.8, source: 'ctrf' },
];

const securityFindings: SecurityFinding[] = [
    { tool: 'gitleaks', severity: 'high', title: 'leaked secret', confidence: 0.9 },
];

const deployments: Deployment[] = [
    { id: 'd1', environment: 'prod', status: 'success', createdAt: '2026-07-01T00:00:00Z', confidence: 1 },
];

const releases: Release[] = [
    { id: 'r1', tag: 'v1.0.0', draft: false, prerelease: false, createdAt: '2026-07-01T00:00:00Z', confidence: 1 },
];

const doraMetrics: DoraMetrics = {
    deploymentFrequency: 5,
    leadTimeForChanges: 120,
    meanTimeToRecovery: 60,
    changeFailureRate: 0.1,
    source: 'github',
    confidence: 0.9,
};

const pmIssues: RawIssue[] = [
    {
        source: 'github',
        id: 42,
        key: 42,
        title: 'bug',
        state: 'open',
        labels: ['bug'],
        createdAt: '2026-07-01T00:00:00Z',
        confidence: 1,
    },
];

const coverageFiles: CoverageFile[] = [
    { file: 'src/a.ts', lines: { total: 10, covered: 8, percentage: 80 }, confidence: 1 },
];

const performanceMetrics: PerformanceMetrics = {
    pipelineDurationMs: 30000,
    queueWaitMs: 5000,
    billableMinutes: 2,
    confidence: 1,
};

describe('ST-1 persistence: array categories round-trip', () => {
    let persistence: ReturnType<typeof createDataHubPersistence>;

    beforeEach(() => {
        persistence = makeHub().persistence;
    });

    it('save/load failureRecords preserves order and content', () => {
        expect(persistence.loadFailureRecords()).toStrictEqual([]);

        persistence.saveFailureRecords(failureRecords);

        expect(persistence.loadFailureRecords()).toStrictEqual(failureRecords);
    });

    it('save/load securityFindings', () => {
        persistence.saveSecurityFindings(securityFindings);

        expect(persistence.loadSecurityFindings()).toStrictEqual(securityFindings);
    });

    it('save/load deployments', () => {
        persistence.saveDeployments(deployments);

        expect(persistence.loadDeployments()).toStrictEqual(deployments);
    });

    it('save/load releases', () => {
        persistence.saveReleases(releases);

        expect(persistence.loadReleases()).toStrictEqual(releases);
    });

    it('save/load pmIssues', () => {
        persistence.savePmIssues(pmIssues);

        expect(persistence.loadPmIssues()).toStrictEqual(pmIssues);
    });

    it('save/load coverageFiles', () => {
        persistence.saveCoverageFiles(coverageFiles);

        expect(persistence.loadCoverageFiles()).toStrictEqual(coverageFiles);
    });
});

describe('ST-1 persistence: object categories round-trip', () => {
    let persistence: ReturnType<typeof createDataHubPersistence>;

    beforeEach(() => {
        persistence = makeHub().persistence;
    });

    it('save/load doraMetrics', () => {
        expect(persistence.loadDoraMetrics()).toBeNull();

        persistence.saveDoraMetrics(doraMetrics);

        expect(persistence.loadDoraMetrics()).toStrictEqual(doraMetrics);
    });

    it('save/load performanceMetrics', () => {
        expect(persistence.loadPerformanceMetrics()).toBeNull();

        persistence.savePerformanceMetrics(performanceMetrics);

        expect(persistence.loadPerformanceMetrics()).toStrictEqual(performanceMetrics);
    });
});

describe('ST-1 persistence: missing file safeguards', () => {
    it('loadCategoryArray returns [] (never null) when file absent', () => {
        const { persistence } = makeHub();

        expect(persistence.loadFailureRecords()).toStrictEqual([]);

        expect(persistence.loadSecurityFindings()).toStrictEqual([]);

        expect(persistence.loadDeployments()).toStrictEqual([]);

        expect(persistence.loadReleases()).toStrictEqual([]);

        expect(persistence.loadPmIssues()).toStrictEqual([]);

        expect(persistence.loadCoverageFiles()).toStrictEqual([]);
    });

    it('loadCategoryObject returns null (never throw) when file absent', () => {
        const { persistence } = makeHub();

        expect(persistence.loadDoraMetrics()).toBeNull();

        expect(persistence.loadPerformanceMetrics()).toBeNull();
    });
});

describe('ST-1 persistence: overwrite semantics (no silent append)', () => {
    it('saveFailureRecords overwrites previous file content', () => {
        const { persistence } = makeHub();

        persistence.saveFailureRecords(failureRecords);

        const second: FailureRecord[] = [{ name: 'only-me', status: 'skipped', confidence: 0.5, source: 'junit' }];

        persistence.saveFailureRecords(second);

        expect(persistence.loadFailureRecords()).toStrictEqual(second);
    });
});
