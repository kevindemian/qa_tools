import type { AxiosInstance } from 'axios';
import { handleError } from '../shared/git-provider-error';
import type {
    PipelineTriggerResult,
    ScheduleInfo,
    PipelineRun,
    PipelineInfo,
    PipelineJob,
    ArtifactInfo,
    CICDVariable,
    JsonObject,
} from '../shared/types';
import { apiGet, apiPost, projectPath } from './gitlab-api';

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
    return apiPost(client, base + '/pipeline', payload, { operation: 'disparar pipeline' }) as Promise<
        PipelineTriggerResult | undefined
    >;
}

export async function glGetSchedules(client: AxiosInstance, owner: string, repo: string): Promise<ScheduleInfo[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet(client, base + '/pipeline_schedules', {
        operation: 'listar schedules',
        params: { per_page: SCHEDULES_PAGE_SIZE },
        returnNull: true,
    });
    return (data || []) as ScheduleInfo[];
}

export async function glRunSchedule(
    client: AxiosInstance,
    owner: string,
    repo: string,
    scheduleId: string | number,
): Promise<JsonObject> {
    const base = projectPath(owner, repo);
    return apiPost(client, base + `/pipeline_schedules/${scheduleId}/play`, undefined, {
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
    const data = await apiGet(client, base + '/pipelines', {
        operation: 'buscar pipelines',
        params: { per_page: count, order_by: 'updated_at' },
        returnNull: true,
    });
    return (data || []) as PipelineRun[];
}

export async function glGetPipeline(
    client: AxiosInstance,
    owner: string,
    repo: string,
    pipelineId: string | number,
): Promise<PipelineInfo | null> {
    const base = projectPath(owner, repo);
    return apiGet(client, base + `/pipelines/${pipelineId}`, {
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
    const data = await apiGet(client, base + `/pipelines/${pipelineId}/jobs`, {
        operation: 'listar jobs',
        returnNull: true,
    });
    return (data || []).map((j: JsonObject) => ({
        id: j.id,
        name: j.name,
        stage: j.stage,
        status: j.status,
    }));
}

export async function glListPipelineArtifacts(
    client: AxiosInstance,
    owner: string,
    repo: string,
    pipelineId: string | number,
): Promise<ArtifactInfo[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet(client, base + `/pipelines/${pipelineId}/jobs`, {
        operation: 'listar artifacts',
        returnNull: true,
    });
    const jobs = data || [];
    return jobs
        .filter((j: JsonObject) => j.artifacts_file || (j.artifacts && (j.artifacts as Array<unknown>).length > 0))
        .map((j: JsonObject) => ({ id: j.id, name: j.name }));
}

export async function glGetCICDVariables(client: AxiosInstance, owner: string, repo: string): Promise<CICDVariable[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet(client, base + '/variables', {
        operation: 'buscar variáveis CI/CD',
        params: { per_page: VARIABLES_PAGE_SIZE },
        returnNull: true,
    });
    return (data || []) as CICDVariable[];
}

export async function glDownloadArtifact(
    client: AxiosInstance,
    owner: string,
    repo: string,
    artifactId: string | number,
): Promise<{ buffer: Buffer; filename: string }> {
    const base = projectPath(owner, repo);
    try {
        const response = await client.get(base + `/jobs/${artifactId}/artifacts`, {
            responseType: 'arraybuffer',
        });
        const disposition = (response.headers['content-disposition'] as string) || '';
        const match = disposition.match(/filename="?(.+?)"?$/);
        const filename = match ? match[1]! : 'artifacts.zip';
        return { buffer: Buffer.from(response.data as ArrayBuffer), filename };
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
        const raw = typeof response.data === 'string' ? response.data : String(response.data);
        return raw.slice(0, maxBytes);
    } catch (err) {
        return handleError(err, { context: 'baixar log do job', returnNull: true });
    }
}
