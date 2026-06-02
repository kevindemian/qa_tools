import { jest } from '@jest/globals';
import type Config from '../config-accessor';
import type { MetricsRun, MetricsStore, FlakinessEntry, TrendPoint, CoverageSnapshot } from '../metrics';

export const loadMetrics = jest.fn<(config?: Config) => MetricsStore>().mockReturnValue({ runs: [] });

export const saveRunMetrics = jest.fn<(run: MetricsRun, config?: Config) => void>();

export const saveParseResult = jest.fn<(project: string, result: unknown, config?: Config) => MetricsRun>(() => ({
    timestamp: '',
    project: '',
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    tests: [],
}));

export const calculateFlakiness = jest
    .fn<(store: MetricsStore, minRuns?: number) => FlakinessEntry[]>()
    .mockReturnValue([]);

export const saveCoverageSnapshot = jest.fn<(snapshot: CoverageSnapshot, config?: Config) => void>();

export const getTrends = jest.fn<(store: MetricsStore, window?: number) => TrendPoint[]>().mockReturnValue([]);
