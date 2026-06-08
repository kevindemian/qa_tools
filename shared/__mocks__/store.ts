import type { StoreBackend } from '../store-backend.js';
import type { FlatTest } from '../result_parser.js';
import type { ReportMeta, BranchEntry } from '../store.js';

export type { ReportMeta, BranchEntry };

function createMockStore() {
    return {
        lookup: vi.fn<(sha: string) => ReportMeta | null>().mockReturnValue(null),
        put: vi.fn<(sha: string, meta: ReportMeta) => void>(),
        listByProject: vi.fn<() => ReportMeta[]>().mockReturnValue([]),
        appendBranch: vi.fn<(branch: string, entry: BranchEntry) => void>(),
        getBranch: vi.fn<(branch: string) => BranchEntry[]>().mockReturnValue([]),
        saveReport: vi.fn<(sha: string, data: FlatTest[]) => void>(),
        loadReport: vi.fn<(sha: string) => { tests: FlatTest[] } | null>().mockReturnValue(null),
        loadMetrics: vi.fn<() => Record<string, unknown> | null>().mockReturnValue(null),
        saveMetrics: vi.fn<(data: Record<string, unknown>) => void>(),
        flush: vi.fn<(message: string) => void>(),
    };
}

export const Store = vi.fn(function (_backend: StoreBackend, _project: string) {
    return createMockStore();
});
