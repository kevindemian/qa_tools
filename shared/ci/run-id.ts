/**
 * CI run id normalization — dedup key for `DataHub.saveParseResult(sourceRunId)`
 * (F0-T8). `raw.parsedArtifacts` is keyed by `Map<number, ...>`, so the run id
 * must be a positive integer; a non-integer key would silently break dedup and
 * the tests contract. Boundary guard (§24): never emits 0/NaN — missing or
 * invalid ids resolve to `undefined`, letting the caller use the synthetic
 * user-fallback slot (key 0) instead of crashing the flow.
 */

/**
 * Normalize a raw run id (string | number) to a positive integer.
 * Returns `undefined` for missing, empty, non-numeric or non-positive values.
 *
 * @param raw - Run id as provided by the pipeline/env.
 */
export function normalizeRunId(raw: string | number | undefined): number | undefined {
    if (raw === undefined || raw === '') return undefined;
    const id = typeof raw === 'number' ? raw : Number(raw);
    return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Resolve the current CI run id from environment variables.
 *
 * GitHub Actions: `GITHUB_RUN_ID`
 * GitLab CI: `CI_PIPELINE_ID`
 * Azure Pipelines: `BUILD_BUILDID`
 *
 * @param env - Env override (tests); defaults to `process.env`.
 */
export function getCiRunId(env?: NodeJS.ProcessEnv): number | undefined {
    const e = env ?? process.env;
    return normalizeRunId(e['GITHUB_RUN_ID'] ?? e['CI_PIPELINE_ID'] ?? e['BUILD_BUILDID']);
}
