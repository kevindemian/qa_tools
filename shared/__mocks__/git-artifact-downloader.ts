import type { ParseResult } from '../result_parser.js';

export const fetchGitHistory = vi.fn<(project: string) => Promise<unknown[]>>().mockResolvedValue([]);
export const fetchLatestTestRun = vi.fn<() => Promise<ParseResult | null>>().mockResolvedValue(null);
