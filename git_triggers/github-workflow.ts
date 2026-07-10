import type { AxiosInstance } from '../shared/deps.js';
import { rootLogger } from '../shared/logger.js';
import { handleError } from '../shared/git-provider-error.js';
import { extractErrorMessage } from '../shared/prompt-errors.js';
import type {
    PipelineTriggerResult,
    ScheduleInfo,
    PipelineRun,
    PipelineInfo,
    PipelineJob,
    ArtifactInfo,
    CICDVariable,
    JsonObject,
    DirEntry,
} from '../shared/types.js';
import { apiGet, apiPost } from './github-api.js';

const LIST_WORKFLOWS_PAGE_SIZE = 10;
const VARIABLES_PAGE_SIZE = 100;
const LOG_TRUNCATION_BYTES = 10240;
const MAX_REDIRECTS = 5;
const DEFAULT_PIPELINE_COUNT = 5;

function toInputs(variables: Array<{ key: string; value: string }>): Record<string, string> {
    if (!Array.isArray(variables)) return {};
    const inputs: Record<string, string> = {};
    for (const v of variables) {
        if (v.key) inputs[v.key] = v.value;
    }
    return inputs;
}

async function listWorkflows(
    client: AxiosInstance,
    owner: string,
    repo: string,
): Promise<Array<{ id: number; name: string }>> {
    const data = await apiGet<{ workflows: Array<{ id: number; name: string }> }>(
        client,
        '/repos/' + owner + '/' + repo + '/actions/workflows',
        {
            operation: 'listar workflows',
            params: { per_page: LIST_WORKFLOWS_PAGE_SIZE },
            returnNull: true,
        },
    );
    return data?.workflows || [];
}

export async function wfTriggerPipeline(
    client: AxiosInstance,
    owner: string,
    repo: string,
    apiUrl: string,
    payload: { ref: string; variables: Array<{ key: string; value: string }>; workflow_id?: string },
): Promise<PipelineTriggerResult | undefined> {
    try {
        const workflowId = payload.workflow_id;
        if (!workflowId) {
            const workflows = await listWorkflows(client, owner, repo);
            if (workflows.length === 0) {
                rootLogger.warn('No workflows found in repository for project ' + owner + '/' + repo);
                return undefined;
            }
            const workflow = workflows[0] as (typeof workflows)[number];
            await apiPost(
                client,
                '/repos/' + owner + '/' + repo + '/actions/workflows/' + workflow.id + '/dispatches',
                { ref: payload.ref, inputs: toInputs(payload.variables) },
                { operation: 'disparar workflow' },
            );
            return { id: workflow.id, web_url: apiUrl + '/' + owner + '/' + repo + '/actions/runs' };
        }
        await apiPost(
            client,
            '/repos/' + owner + '/' + repo + '/actions/workflows/' + workflowId + '/dispatches',
            { ref: payload.ref, inputs: toInputs(payload.variables) },
            { operation: 'disparar workflow' },
        );
        return { id: workflowId, web_url: apiUrl + '/' + owner + '/' + repo + '/actions/runs' };
    } catch (err) {
        return handleError(err, { context: 'disparar workflow' });
    }
}

export async function wfGetRecentPipelines(
    client: AxiosInstance,
    owner: string,
    repo: string,
    count = DEFAULT_PIPELINE_COUNT,
): Promise<PipelineRun[]> {
    const data = await apiGet<{ workflow_runs: PipelineRun[] }>(
        client,
        '/repos/' + owner + '/' + repo + '/actions/runs',
        {
            operation: 'buscar runs',
            params: { per_page: count },
            returnNull: true,
        },
    );
    return data?.workflow_runs || [];
}

export async function wfGetPipeline(
    client: AxiosInstance,
    owner: string,
    repo: string,
    runId: string | number,
): Promise<PipelineInfo | null> {
    return apiGet<PipelineInfo>(client, '/repos/' + owner + '/' + repo + '/actions/runs/' + runId, {
        operation: 'buscar run',
        returnNull: true,
    });
}

export async function wfGetPipelineJobs(
    client: AxiosInstance,
    owner: string,
    repo: string,
    pipelineId: string | number,
): Promise<PipelineJob[]> {
    const data = await apiGet<{
        jobs: Array<{
            id: number;
            name: string;
            runner_group_name?: string;
            conclusion?: string;
            status?: string;
            started_at?: string;
            completed_at?: string | null;
            steps?: Array<{
                name: string;
                conclusion: string | null;
                number: number;
            }>;
        }>;
    }>(client, '/repos/' + owner + '/' + repo + '/actions/runs/' + pipelineId + '/jobs', {
        operation: 'listar jobs',
        returnNull: true,
    });
    const jobs = data?.jobs || [];
    return jobs.map((j) => {
        const duration = computeJobDurationSeconds(j.started_at, j.completed_at);
        const steps = mapStepConclusions(j.steps);
        return {
            id: j.id,
            name: j.name,
            stage: j.runner_group_name ?? '',
            status: j.conclusion ?? j.status ?? '',
            ...(j.started_at != null && { started_at: j.started_at }),
            ...(j.completed_at != null && { finished_at: j.completed_at }),
            ...(duration != null && { duration }),
            ...(steps != null && { stepConclusions: steps }),
        } satisfies PipelineJob;
    });
}

function computeJobDurationSeconds(startedAt?: string, completedAt?: string | null): number | undefined {
    if (startedAt == null || completedAt == null) return undefined;
    const startMs = Date.parse(startedAt);
    const endMs = Date.parse(completedAt);
    if (isNaN(startMs) || isNaN(endMs)) return undefined;
    return Math.round((endMs - startMs) / 1000);
}

function mapStepConclusions(
    steps?: Array<{ name: string; conclusion: string | null; number: number }>,
): Array<{ name: string; conclusion: string; number: number }> | undefined {
    if (steps == null || steps.length === 0) return undefined;
    return steps
        .filter((s) => s.conclusion != null)
        .map((s) => ({
            name: s.name,
            conclusion: s.conclusion as string,
            number: s.number,
        }));
}

export async function wfListPipelineArtifacts(
    client: AxiosInstance,
    owner: string,
    repo: string,
    pipelineId: string | number,
): Promise<ArtifactInfo[]> {
    const data = await apiGet<{
        artifacts: Array<{ id: number; name: string; size_in_bytes?: number; created_at?: string }>;
    }>(client, '/repos/' + owner + '/' + repo + '/actions/runs/' + pipelineId + '/artifacts', {
        operation: 'listar artifacts',
        returnNull: true,
    });
    const artifacts = data?.artifacts || [];
    return artifacts.map((a) => ({
        id: a.id,
        name: a.name,
        ...(a.size_in_bytes != null && { size_in_bytes: a.size_in_bytes }),
        ...(a.created_at != null && { created_at: a.created_at }),
    }));
}

export async function wfDownloadArtifact(
    client: AxiosInstance,
    owner: string,
    repo: string,
    artifactId: string | number,
): Promise<{ buffer: Buffer; filename: string }> {
    try {
        const response = await client.get<ArrayBuffer>(
            '/repos/' + owner + '/' + repo + '/actions/artifacts/' + artifactId + '/zip',
            {
                responseType: 'arraybuffer',
                maxRedirects: MAX_REDIRECTS,
            },
        );
        return { buffer: Buffer.from(response.data), filename: 'artifact.zip' };
    } catch (err) {
        return handleError(err, { context: 'baixar artifact' });
    }
}

export async function wfGetJobLogs(
    client: AxiosInstance,
    owner: string,
    repo: string,
    jobId: string | number,
    maxBytes = LOG_TRUNCATION_BYTES,
): Promise<string | null> {
    try {
        const response = await client.get('/repos/' + owner + '/' + repo + '/actions/jobs/' + jobId + '/logs', {
            responseType: 'text' as const,
            maxRedirects: MAX_REDIRECTS,
        });
        const raw = typeof response.data === 'string' ? response.data : String(response.data);
        return raw.slice(0, maxBytes);
    } catch (err) {
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr.response?.status === 404) return null;
        return handleError(err, { context: 'baixar log do job' });
    }
}

export async function wfGetCICDVariables(client: AxiosInstance, owner: string, repo: string): Promise<CICDVariable[]> {
    const data = await apiGet<{ variables: Array<{ name: string; value: string }> }>(
        client,
        '/repos/' + owner + '/' + repo + '/actions/variables',
        {
            operation: 'buscar variáveis',
            params: { per_page: VARIABLES_PAGE_SIZE },
            returnNull: true,
        },
    );
    const variables = data?.variables || [];
    return variables.map((v) => ({
        key: v.name,
        value: v.value,
        type: 'variable',
    }));
}

/**
 * Fetch workflow run timing from the GitHub Actions API.
 * Extracts run_duration_ms from the timing endpoint.
 * Note: This endpoint is in the process of closing down
 * (billable minutes migration) but still operational as of 2026.
 */
export async function wfGetWorkflowRunTiming(
    client: AxiosInstance,
    owner: string,
    repo: string,
    runId: number,
): Promise<{ run_duration_ms: number } | null> {
    try {
        const timing = await apiGet<{ run_duration_ms: number }>(
            client,
            '/repos/' + owner + '/' + repo + '/actions/runs/' + runId + '/timing',
            { operation: 'buscar run duration', returnNull: true },
        );
        if (timing == null) return null;
        return { run_duration_ms: timing.run_duration_ms };
    } catch (err) {
        return handleError(err, { context: 'buscar run duration', returnNull: true });
    }
}

export function wfGetSchedules(): Promise<ScheduleInfo[]> {
    return Promise.resolve([]);
}

export function wfRunSchedule(_scheduleId: string | number): Promise<JsonObject> {
    throw new Error(
        'GitHub Actions schedules not available via REST API. Use workflow_dispatch or repository_dispatch.',
    );
}

import { isManifestFile } from '../shared/framework-detection.js';

interface GitHubTreeEntry {
    path: string;
    type: 'blob' | 'tree';
}

interface GitHubTreeResponse {
    tree: GitHubTreeEntry[];
    truncated: boolean;
}

/**
 * Fetch the full repository tree via Git Trees API (recursive).
 * Returns paths of all manifest files found, or null on error.
 * Falls back gracefully on API failure (422 for very large repos, etc.).
 */
export async function wfGetRepoTree(
    client: AxiosInstance,
    owner: string,
    repo: string,
    branch: string,
): Promise<string[] | null> {
    try {
        const data = await apiGet<GitHubTreeResponse>(
            client,
            `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
            { operation: 'buscar árvore do repositório', returnNull: true },
        );
        if (data == null) return null;
        const paths = data.tree
            .filter((entry) => entry.type === 'blob' && isManifestFile(entry.path))
            .map((entry) => entry.path);
        if (data.truncated) {
            rootLogger.warn(`GitHub: tree truncated for ${owner}/${repo}@${branch}`);
        }
        return paths.length > 0 ? paths : [];
    } catch (err: unknown) {
        rootLogger.warn(`github-workflow: listManifestPaths failed — ${extractErrorMessage(err)}`);
        return null;
    }
}

/**
 * Read a file from the repository via GitHub Contents API.
 * Returns raw file content as string, or null if not found.
 */
export async function wfGetFileContents(
    client: AxiosInstance,
    owner: string,
    repo: string,
    path: string,
    ref?: string,
): Promise<string | null> {
    try {
        const url =
            `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}` +
            (ref != null ? `?ref=${encodeURIComponent(ref)}` : '');
        const response = await client.get<string>(url, {
            headers: { Accept: 'application/vnd.github.v3.raw' },
            responseType: 'text' as const,
        });
        return response.data;
    } catch (err) {
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr.response?.status === 404) return null;
        return handleError(err, { context: `ler arquivo ${path}`, returnNull: true });
    }
}

/**
 * List a directory in the repository via GitHub Contents API.
 * Returns entries with name, path, and type, or null on error.
 */
export async function wfListDirectory(
    client: AxiosInstance,
    owner: string,
    repo: string,
    path: string,
    ref?: string,
): Promise<DirEntry[] | null> {
    try {
        const url =
            `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}` +
            (ref != null ? `?ref=${encodeURIComponent(ref)}` : '');
        const response = await client.get<Array<{ name: string; path: string; type: string }>>(url);
        const entries = response.data;
        if (!Array.isArray(entries)) return null;
        return entries
            .filter((e) => e.type === 'file' || e.type === 'dir')
            .map((e) => ({
                name: e.name,
                path: e.path,
                type: e.type as 'file' | 'dir',
            }));
    } catch (err) {
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr.response?.status === 404) return null;
        return handleError(err, { context: `listar diretório ${path}`, returnNull: true });
    }
}

/**
 * Cache for repository tree results to avoid repeated API calls.
 * Keyed by `${owner}/${repo}/${ref}`.
 */
const treeCache = new Map<string, { timestamp: number; paths: string[] | null }>();
const TREE_CACHE_TTL_MS = 300_000; // 5 minutes

/**
 * Get repository tree with in-memory caching.
 * Returns cached result if available and within TTL, otherwise fetches from API.
 */
export async function wfGetRepoTreeCached(
    client: AxiosInstance,
    owner: string,
    repo: string,
    ref: string,
): Promise<string[] | null> {
    const cacheKey = `${owner}/${repo}/${ref}`;
    const cached = treeCache.get(cacheKey);
    if (cached != null && Date.now() - cached.timestamp < TREE_CACHE_TTL_MS) {
        return cached.paths;
    }
    const paths = await wfGetRepoTree(client, owner, repo, ref);
    treeCache.set(cacheKey, { timestamp: Date.now(), paths });
    return paths;
}

/** Clear the tree cache (for testing). */
export function clearTreeCache(): void {
    treeCache.clear();
}
