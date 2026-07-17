import Config from './config-accessor.js';
import type { FlakinessEntry } from './types/data-hub.js';

export const GIT_HISTORY_RUNS = 5;

export interface RunStats {
    runId: number | string;
    createdAt: string;
    passed: number;
    failed: number;
    skipped: number;
    total: number;
}

export interface CiContext {
    commits: string;
    runs: RunStats[];
    flakyEntries: FlakinessEntry[];
}

export function isGitHubCi(): boolean {
    return !!(Config.get('githubToken') && Config.get('GITHUB_REPOSITORY'));
}

export function isGitLabCi(): boolean {
    return !!(Config.get('CI_JOB_TOKEN') && Config.get('CI_PROJECT_ID'));
}
