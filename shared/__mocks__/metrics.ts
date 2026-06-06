import type Config from '../config-accessor.js';
import type { MetricsRun, MetricsStore, FlakinessEntry, TrendPoint, CoverageSnapshot } from '../metrics.js';

export const loadMetrics = vi.fn<(config?: Config) => MetricsStore>().mockReturnValue({ runs: [] });

export const saveRunMetrics = vi.fn<(run: MetricsRun, config?: Config) => void>();

export const saveParseResult = vi.fn<(project: string, result: unknown, config?: Config) => MetricsRun>(() => ({
    timestamp: '',
    project: '',
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    tests: [],
}));

export const calculateFlakiness = vi
    .fn<(store: MetricsStore, minRuns?: number) => FlakinessEntry[]>()
    .mockReturnValue([]);

export const saveCoverageSnapshot = vi.fn<(snapshot: CoverageSnapshot, config?: Config) => void>();

export const getTrends = vi.fn<(store: MetricsStore, window?: number) => TrendPoint[]>().mockReturnValue([]);
