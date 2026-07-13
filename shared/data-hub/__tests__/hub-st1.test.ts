/**
 * ST-1 hub delegate tests — verify DataHubImpl forwards the 16 new category
 * methods to its private persistence layer (SSOT encapsulation, no bypass).
 *
 * The persistence mock is built from explicit `vi.fn()` consts so each method
 * is a first-class Mock (supports `.mockReturnValue` / `.toHaveBeenCalledWith`)
 * and is referenced as a value (no `unbound-method` violation).
 */
import { describe, it, expect, vi } from 'vitest';
import type {
    DataHubPersistence,
    FailureRecord,
    SecurityFinding,
    Deployment,
    Release,
    DoraMetrics,
    RawIssue,
    CoverageFile,
    PerformanceMetrics,
    CoverageSnapshot,
    FailureClassification,
    QualityMetricsSnapshot,
    MetricsRun,
    ReportMeta,
    BranchEntry,
} from '../../types/data-hub.js';
import type { ParseResult, FlatTest } from '../../result_parser.js';
import { DataHubImpl } from '../hub.js';

const failureRecords: FailureRecord[] = [{ name: 'a', status: 'failed', confidence: 1, source: 'junit' }];
const securityFindings: SecurityFinding[] = [{ tool: 't', severity: 'high', title: 'x', confidence: 1 }];
const deployments: Deployment[] = [{ id: 'd1', environment: 'prod', status: 'success', createdAt: 't', confidence: 1 }];
const releases: Release[] = [{ id: 'r1', tag: 'v1', draft: false, prerelease: false, createdAt: 't', confidence: 1 }];
const doraMetrics: DoraMetrics = { deploymentFrequency: 5, confidence: 1 };
const pmIssues: RawIssue[] = [
    { source: 'github', id: 1, title: 'a', state: 'open', labels: [], createdAt: 't', confidence: 1 },
];
const coverageFiles: CoverageFile[] = [
    { file: 'a.ts', lines: { total: 1, covered: 1, percentage: 100 }, confidence: 1 },
];
const performanceMetrics: PerformanceMetrics = { pipelineDurationMs: 100, confidence: 1 };

describe('ST-1 hub delegates to persistence', () => {
    function makeHub() {
        const saveRun = vi.fn<(sha: string, run: unknown) => void>();
        const saveCoverageSnapshot = vi.fn<(snapshot: unknown) => void>();
        const loadCoverageHistory = vi.fn<(project: string) => CoverageSnapshot[]>().mockReturnValue([]);
        const saveFailureClassification = vi.fn<(classification: unknown) => void>();
        const loadFailureClassifications = vi.fn<(project: string) => FailureClassification[]>().mockReturnValue([]);
        const saveMetricsStore = vi.fn<(store: unknown) => void>();
        const saveParseResult = vi.fn<(project: string, result: ParseResult) => MetricsRun>();
        const saveQualityMetrics = vi.fn<(snapshot: unknown) => void>();
        const loadQualityMetricsHistory = vi.fn<() => QualityMetricsSnapshot[]>().mockReturnValue([]);
        const saveFailureRecords = vi.fn<(records: FailureRecord[]) => void>();
        const loadFailureRecords = vi.fn<() => FailureRecord[]>().mockReturnValue([]);
        const saveSecurityFindings = vi.fn<(findings: SecurityFinding[]) => void>();
        const loadSecurityFindings = vi.fn<() => SecurityFinding[]>().mockReturnValue([]);
        const saveDeployments = vi.fn<(deployments: Deployment[]) => void>();
        const loadDeployments = vi.fn<() => Deployment[]>().mockReturnValue([]);
        const saveReleases = vi.fn<(releases: Release[]) => void>();
        const loadReleases = vi.fn<() => Release[]>().mockReturnValue([]);
        const saveDoraMetrics = vi.fn<(metrics: DoraMetrics) => void>();
        const loadDoraMetrics = vi.fn<() => DoraMetrics | null>().mockReturnValue(null);
        const savePmIssues = vi.fn<(issues: RawIssue[]) => void>();
        const loadPmIssues = vi.fn<() => RawIssue[]>().mockReturnValue([]);
        const saveCoverageFiles = vi.fn<(files: CoverageFile[]) => void>();
        const loadCoverageFiles = vi.fn<() => CoverageFile[]>().mockReturnValue([]);
        const savePerformanceMetrics = vi.fn<(metrics: PerformanceMetrics) => void>();
        const loadPerformanceMetrics = vi.fn<() => PerformanceMetrics | null>().mockReturnValue(null);
        // ─── Test-result cache (SHA-keyed) — owned by DataHub (replaces legacy Store) ─
        const loadReport = vi.fn<(sha: string) => { tests: FlatTest[] } | null>().mockReturnValue(null);
        const saveReport = vi.fn<(sha: string, tests: FlatTest[]) => void>();
        const put = vi.fn<(sha: string, meta: ReportMeta) => void>();
        const getBranch = vi.fn<(branch: string) => BranchEntry[]>().mockReturnValue([]);
        const loadMetrics = vi.fn<() => null>().mockReturnValue(null);
        const saveMetrics = vi.fn<(data: unknown) => void>();
        const flush = vi.fn<(message: string) => void>();

        const persistence: DataHubPersistence = {
            saveRun,
            saveCoverageSnapshot,
            loadCoverageHistory,
            saveFailureClassification,
            loadFailureClassifications,
            saveMetricsStore,
            saveParseResult,
            saveQualityMetrics,
            loadQualityMetricsHistory,
            saveFailureRecords,
            loadFailureRecords,
            saveSecurityFindings,
            loadSecurityFindings,
            saveDeployments,
            loadDeployments,
            saveReleases,
            loadReleases,
            saveDoraMetrics,
            loadDoraMetrics,
            savePmIssues,
            loadPmIssues,
            saveCoverageFiles,
            loadCoverageFiles,
            savePerformanceMetrics,
            loadPerformanceMetrics,
            loadReport,
            saveReport,
            put,
            getBranch,
            loadMetrics,
            saveMetrics,
            flush,
        };

        const hub = DataHubImpl.createEmpty('github', 'o/r', persistence);

        return {
            hub,
            saveFailureRecords,
            loadFailureRecords,
            saveSecurityFindings,
            loadSecurityFindings,
            saveDeployments,
            loadDeployments,
            saveReleases,
            loadReleases,
            saveDoraMetrics,
            loadDoraMetrics,
            savePmIssues,
            loadPmIssues,
            saveCoverageFiles,
            loadCoverageFiles,
            savePerformanceMetrics,
            loadPerformanceMetrics,
        };
    }

    it('saveFailureRecords forwards to persistence', () => {
        const { saveFailureRecords, hub } = makeHub();

        hub.saveFailureRecords(failureRecords);

        expect(saveFailureRecords).toHaveBeenCalledWith(failureRecords);
    });

    it('loadFailureRecords returns persistence result', () => {
        const { loadFailureRecords, hub } = makeHub();

        loadFailureRecords.mockReturnValue(failureRecords);

        expect(hub.loadFailureRecords()).toBe(failureRecords);
    });

    it('saveSecurityFindings/loadSecurityFindings', () => {
        const { saveSecurityFindings, loadSecurityFindings, hub } = makeHub();

        hub.saveSecurityFindings(securityFindings);

        expect(saveSecurityFindings).toHaveBeenCalledWith(securityFindings);

        loadSecurityFindings.mockReturnValue(securityFindings);

        expect(hub.loadSecurityFindings()).toBe(securityFindings);
    });

    it('saveDeployments/loadDeployments', () => {
        const { saveDeployments, loadDeployments, hub } = makeHub();

        hub.saveDeployments(deployments);

        expect(saveDeployments).toHaveBeenCalledWith(deployments);

        loadDeployments.mockReturnValue(deployments);

        expect(hub.loadDeployments()).toBe(deployments);
    });

    it('saveReleases/loadReleases', () => {
        const { saveReleases, loadReleases, hub } = makeHub();

        hub.saveReleases(releases);

        expect(saveReleases).toHaveBeenCalledWith(releases);

        loadReleases.mockReturnValue(releases);

        expect(hub.loadReleases()).toBe(releases);
    });

    it('saveDoraMetrics/loadDoraMetrics', () => {
        const { saveDoraMetrics, loadDoraMetrics, hub } = makeHub();

        hub.saveDoraMetrics(doraMetrics);

        expect(saveDoraMetrics).toHaveBeenCalledWith(doraMetrics);

        loadDoraMetrics.mockReturnValue(doraMetrics);

        expect(hub.loadDoraMetrics()).toBe(doraMetrics);
    });

    it('savePmIssues/loadPmIssues', () => {
        const { savePmIssues, loadPmIssues, hub } = makeHub();

        hub.savePmIssues(pmIssues);

        expect(savePmIssues).toHaveBeenCalledWith(pmIssues);

        loadPmIssues.mockReturnValue(pmIssues);

        expect(hub.loadPmIssues()).toBe(pmIssues);
    });

    it('saveCoverageFiles/loadCoverageFiles', () => {
        const { saveCoverageFiles, loadCoverageFiles, hub } = makeHub();

        hub.saveCoverageFiles(coverageFiles);

        expect(saveCoverageFiles).toHaveBeenCalledWith(coverageFiles);

        loadCoverageFiles.mockReturnValue(coverageFiles);

        expect(hub.loadCoverageFiles()).toBe(coverageFiles);
    });

    it('savePerformanceMetrics/loadPerformanceMetrics', () => {
        const { savePerformanceMetrics, loadPerformanceMetrics, hub } = makeHub();

        hub.savePerformanceMetrics(performanceMetrics);

        expect(savePerformanceMetrics).toHaveBeenCalledWith(performanceMetrics);

        loadPerformanceMetrics.mockReturnValue(performanceMetrics);

        expect(hub.loadPerformanceMetrics()).toBe(performanceMetrics);
    });
});
