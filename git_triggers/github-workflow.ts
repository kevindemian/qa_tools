import type { AxiosInstance } from '../shared/deps';
import { rootLogger } from '../shared/logger';
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
import { apiGet, apiPost } from './github-api';

const LIST_WORKFLOWS_PAGE_SIZE = 10;
const VARIABLES_PAGE_SIZE = 100;
const LOG_TRUNCATION_BYTES = 10240;
const MAX_REDIRECTS = 5;
const DEFAULT_PIPELINE_COUNT = 5;

function toInputs(variables: Array<{ key: string; value: string }>): Record<string, string> {
    if (!variables || !Array.isArray(variables)) return {};
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
            if (!workflows || workflows.length === 0) {
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
        jobs: Array<{ id: number; name: string; runner_group_name?: string; conclusion?: string; status?: string }>;
    }>(client, '/repos/' + owner + '/' + repo + '/actions/runs/' + pipelineId + '/jobs', {
        operation: 'listar jobs',
        returnNull: true,
    });
    const jobs = data?.jobs || [];
    return jobs.map((j) => ({
        id: j.id,
        name: j.name,
        stage: j.runner_group_name || '',
        status: j.conclusion || j.status || '',
    }));
}

export async function wfListPipelineArtifacts(
    client: AxiosInstance,
    owner: string,
    repo: string,
    pipelineId: string | number,
): Promise<ArtifactInfo[]> {
    const data = await apiGet<{ artifacts: Array<{ id: number; name: string }> }>(
        client,
        '/repos/' + owner + '/' + repo + '/actions/runs/' + pipelineId + '/artifacts',
        {
            operation: 'listar artifacts',
            returnNull: true,
        },
    );
    const artifacts = data?.artifacts || [];
    return artifacts.map((a) => ({ id: a.id, name: a.name }));
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

export function wfGetSchedules(): Promise<ScheduleInfo[]> {
    return Promise.resolve([]);
}

export function wfRunSchedule(_scheduleId: string | number): Promise<JsonObject> {
    throw new Error(
        'GitHub Actions schedules not available via REST API. Use workflow_dispatch or repository_dispatch.',
    );
}
