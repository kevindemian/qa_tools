import type { ParseResult } from '../result_parser.js';

export const fetchGitHistory = vi
    .fn<() => Promise<{ commits: string; runs: unknown[]; flakyEntries: unknown[] }>>()
    .mockResolvedValue({ commits: '', runs: [], flakyEntries: [] });
export const fetchLatestTestRun = vi.fn<() => Promise<ParseResult | null>>().mockResolvedValue(null);
