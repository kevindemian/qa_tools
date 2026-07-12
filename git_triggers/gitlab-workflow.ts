import type { AxiosInstance } from '../shared/deps.js';
import { handleError } from '../shared/git-provider-error.js';
import { classifyGitError } from '../shared/errors.js';
import { extractErrorMessage } from '../shared/prompt-errors.js';
import { rootLogger } from '../shared/logger.js';
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
    GitLabTestReport,
} from '../shared/types.js';
import { apiGet, apiPost, projectPath } from './gitlab-api.js';
import { isManifestFile } from '../shared/framework-detection.js';

const SCHEDULES_PAGE_SIZE = 100;
const VARIABLES_PAGE_SIZE = 100;
const DEFAULT_PIPELINE_COUNT = 5;
const LOG_TRUNCATION_BYTES = 10240;

export async function glTriggerPipeline(
    client: AxiosInstance,
    owner: string,
    repo: string,
    payload: { ref: string; variables: Array<{ key: string; value: string }>; workflow_id?: string },
): Promise<PipelineTriggerResult | undefined> {
    const base = projectPath(owner, repo);
    return apiPost<PipelineTriggerResult | undefined>(client, base + '/pipeline', payload, {
        operation: 'disparar pipeline',
    });
}

export async function glGetSchedules(client: AxiosInstance, owner: string, repo: string): Promise<ScheduleInfo[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet<ScheduleInfo[]>(client, base + '/pipeline_schedules', {
        operation: 'listar schedules',
        params: { per_page: SCHEDULES_PAGE_SIZE },
        returnNull: true,
    });
    return data ?? [];
}

export async function glRunSchedule(
    client: AxiosInstance,
    owner: string,
    repo: string,
    scheduleId: string | number,
): Promise<JsonObject> {
    const base = projectPath(owner, repo);
    return apiPost<JsonObject>(client, base + `/pipeline_schedules/${scheduleId}/play`, undefined, {
        operation: 'disparar schedule',
    });
}

export async function glGetRecentPipelines(
    client: AxiosInstance,
    owner: string,
    repo: string,
    count = DEFAULT_PIPELINE_COUNT,
): Promise<PipelineRun[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet<PipelineRun[]>(client, base + '/pipelines', {
        operation: 'buscar pipelines',
        params: { per_page: count, order_by: 'updated_at' },
        returnNull: true,
    });
    return data ?? [];
}

export async function glGetPipeline(
    client: AxiosInstance,
    owner: string,
    repo: string,
    pipelineId: string | number,
): Promise<PipelineInfo | null> {
    const base = projectPath(owner, repo);
    return apiGet<PipelineInfo>(client, base + `/pipelines/${pipelineId}`, {
        operation: 'buscar pipeline',
        returnNull: true,
    });
}

export async function glGetPipelineJobs(
    client: AxiosInstance,
    owner: string,
    repo: string,
    pipelineId: string | number,
): Promise<PipelineJob[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet<JsonObject[]>(client, base + `/pipelines/${pipelineId}/jobs`, {
        operation: 'listar jobs',
        returnNull: true,
    });
    return (data ?? []).map((j: JsonObject) => ({
        id: j['id'] as string | number,
        name: j['name'] as string,
        stage: j['stage'] as string,
        status: j['status'] as string,
        started_at: j['started_at'] as string | undefined,
        finished_at: j['finished_at'] as string | undefined,
        duration: j['duration'] as number | undefined,
    }));
}

export async function glListPipelineArtifacts(
    client: AxiosInstance,
    owner: string,
    repo: string,
    pipelineId: string | number,
): Promise<ArtifactInfo[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet<JsonObject[]>(client, base + `/pipelines/${pipelineId}/jobs`, {
        operation: 'listar artifacts',
        returnNull: true,
    });
    const jobs = data ?? [];
    return jobs
        .filter((j) => j['artifacts_file'] || (j['artifacts'] && (j['artifacts'] as unknown[]).length > 0))
        .map((j: JsonObject) => {
            const artFile = j['artifacts_file'] as { filename?: string; size?: number } | undefined;
            return {
                id: j['id'] as string | number,
                name: j['name'] as string,
                ...(artFile?.size != null && { size_in_bytes: artFile.size }),
            };
        });
}

export async function glGetCICDVariables(client: AxiosInstance, owner: string, repo: string): Promise<CICDVariable[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet<CICDVariable[]>(client, base + '/variables', {
        operation: 'buscar variáveis CI/CD',
        params: { per_page: VARIABLES_PAGE_SIZE },
        returnNull: true,
    });
    return data ?? [];
}

export async function glDownloadArtifact(
    client: AxiosInstance,
    owner: string,
    repo: string,
    artifactId: string | number,
): Promise<{ buffer: Buffer; filename: string }> {
    const base = projectPath(owner, repo);
    try {
        const response = await client.get<ArrayBuffer>(base + `/jobs/${artifactId}/artifacts`, {
            responseType: 'arraybuffer',
        });
        const disposition =
            typeof response.headers['content-disposition'] === 'string' ? response.headers['content-disposition'] : '';
        const match = /filename="?(.+?)"?$/.exec(disposition);
        const filename = match ? (match[1] ?? 'artifacts.zip') : 'artifacts.zip';
        return { buffer: Buffer.from(response.data), filename };
    } catch (err) {
        return handleError(err, { context: 'baixar artifact' });
    }
}

export async function glGetJobLogs(
    client: AxiosInstance,
    owner: string,
    repo: string,
    jobId: string | number,
    maxBytes = LOG_TRUNCATION_BYTES,
): Promise<string | null> {
    const base = projectPath(owner, repo);
    try {
        const response = await client.get(base + `/jobs/${jobId}/trace`, {
            responseType: 'text' as const,
        });
        const raw = String(response.data);
        return raw.slice(0, maxBytes);
    } catch (err) {
        return handleError(err, { context: 'baixar log do job', returnNull: true });
    }
}

interface GitLabTreeEntry {
    name: string;
    path: string;
    type: 'blob' | 'tree';
}

/**
 * Fetch the repository tree via GitLab Repository Tree API (recursive).
 * Returns paths of all manifest files found, or null on error.
 */
export async function glGetRepoTree(
    client: AxiosInstance,
    owner: string,
    repo: string,
    ref: string,
): Promise<string[] | null> {
    const base = projectPath(owner, repo);
    try {
        const data = await apiGet<GitLabTreeEntry[]>(
            client,
            base + `/repository/tree?recursive=true&ref=${encodeURIComponent(ref)}`,
            { operation: 'buscar árvore do repositório', returnNull: true },
        );
        if (data == null) return null;
        const paths = data
            .filter((entry) => entry.type === 'blob')
            .map((entry) => entry.path)
            .filter(isManifestFile);
        return paths.length > 0 ? paths : [];
    } catch (err: unknown) {
        rootLogger.warn(`gitlab-workflow: listManifestPaths failed — ${extractErrorMessage(err)}`);
        return null;
    }
}

/**
 * Read a file from the repository via GitLab Repository Files API.
 * Returns raw file content as string, or null if not found.
 */
export async function glGetFileContents(
    client: AxiosInstance,
    owner: string,
    repo: string,
    path: string,
    ref?: string,
): Promise<string | null> {
    const base = projectPath(owner, repo);
    try {
        const encodedPath = encodeURIComponent(path);
        const url =
            base + `/repository/files/${encodedPath}/raw` + (ref != null ? `?ref=${encodeURIComponent(ref)}` : '');
        const response = await client.get<string>(url, {
            responseType: 'text' as const,
        });
        return response.data;
    } catch (err) {
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr.response?.status === 404) return null;
        throw classifyGitError(err, {
            operation: 'ler arquivo',
            scope: 'read_repository',
            resource: path,
        });
    }
}

/**
 * List a directory in the repository via GitLab Repository Tree API.
 * Returns entries with name, path, and type, or null on error.
 */
export async function glListDirectory(
    client: AxiosInstance,
    owner: string,
    repo: string,
    path: string,
    ref?: string,
): Promise<DirEntry[] | null> {
    const base = projectPath(owner, repo);
    try {
        const url =
            base +
            `/repository/tree?path=${encodeURIComponent(path)}` +
            (ref != null ? `&ref=${encodeURIComponent(ref)}` : '');
        const data = await apiGet<GitLabTreeEntry[]>(client, url, {
            operation: `listar diretório ${path}`,
            returnNull: true,
        });
        if (data == null) return null;
        const dirEntries: DirEntry[] = [];
        for (const e of data) {
            let entryType: 'file' | 'dir';
            switch (e.type) {
                case 'blob':
                    entryType = 'file';
                    break;
                case 'tree':
                    entryType = 'dir';
                    break;
                default:
                    continue;
            }
            dirEntries.push({ name: e.name, path: e.path, type: entryType });
        }
        return dirEntries;
    } catch (err: unknown) {
        rootLogger.warn(`gitlab-workflow: listDirEntries failed — ${extractErrorMessage(err)}`);
        return null;
    }
}

export async function glGetTestReport(
    client: AxiosInstance,
    owner: string,
    repo: string,
    pipelineId: string | number,
): Promise<GitLabTestReport | null> {
    const base = projectPath(owner, repo);
    return apiGet<GitLabTestReport>(client, base + `/pipelines/${pipelineId}/test_report`, {
        operation: 'obter relatório de testes',
        returnNull: true,
    });
}
