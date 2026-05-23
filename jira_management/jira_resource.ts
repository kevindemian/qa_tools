import { createHttpClient } from '../shared/http-client';
import { error as logError, success, info, warn, extractErrorMessage, ProgressBar } from '../shared/prompt';
import { Logger } from '../shared/logger';

function sanitizeJqlValue(value: string): string {
    if (!value || typeof value !== 'string') {
        throw new Error('Valor inválido para consulta JQL.');
    }
    return value.replace(/[^\w\s.:/-]/g, '');
}

interface JiraIssue {
    key: string;
    fields: {
        summary?: string;
        status?: { name: string };
        [key: string]: unknown;
    };
}

interface VersionData {
    id: string;
    name: string;
    released?: boolean;
    releaseDate?: string;
    description?: string;
    [key: string]: unknown;
}

interface TransitionData {
    id: string;
    to?: { name: string };
}

interface SearchResponse {
    issues: JiraIssue[];
    total: number;
}

class JiraResource {
    baseUrl: string;
    axiosInstance: ReturnType<typeof createHttpClient>;
    log: Logger;
    workflowMap: Record<string, string[]> = {
        new: ['approve', 'use test case'],
        'coding in progress': ['coding done', 'done'],
        'coding done': ['done'],
        approve: ['use test case'],
    };

    constructor(personalToken: string, baseUrl: string) {
        this.baseUrl = baseUrl;
        this.axiosInstance = createHttpClient({
            baseUrl,
            authHeader: { Authorization: `Bearer ${personalToken}` },
        });
        this.log = new Logger({ resource: 'JiraAPI' });
    }

    async searchJiraIssues(jql: string, maxResults = 200): Promise<SearchResponse> {
        try {
            const MAX_PAGES = 1000;
            const MAX_TOTAL = 10000;
            let allIssues: JiraIssue[] = [];
            let startAt = 0;
            let total: number | null = null;
            let pages = 0;

            while ((total === null || startAt < total) && pages < MAX_PAGES && allIssues.length < MAX_TOTAL) {
                pages++;
                const url = `search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&startAt=${startAt}`;
                const data = await this.getJiraResource<SearchResponse>(url);

                if (total === null) {
                    total = data.total;
                    if (total > 0) this.log.info(`Buscando ${total} issues...`);
                    if (total > MAX_TOTAL) this.log.warn(`Total (${total}) excede limite de ${MAX_TOTAL}, truncando.`);
                }

                allIssues = allIssues.concat(data.issues || []);
                startAt += maxResults;
            }

            return { issues: allIssues, total: allIssues.length };
        } catch (err: unknown) {
            this.log.error(`Erro searchJiraIssues: ${extractErrorMessage(err)}`);
            return { issues: [], total: 0 };
        }
    }

    async getTransitionsForIssue(issueKey: string): Promise<Record<string, string>> {
        try {
            const data = await this.getJiraResource<{ transitions?: TransitionData[] }>(
                `issue/${issueKey}/transitions`,
            );
            if (!data || !data.transitions) return {};
            const map: Record<string, string> = {};
            for (const t of data.transitions) {
                if (t.to && t.to.name) {
                    map[t.to.name.toLowerCase()] = t.id;
                }
            }
            return map;
        } catch (err: unknown) {
            this.log.error(`Erro GET issue/${issueKey}/transitions: ${extractErrorMessage(err)}`);
            return {};
        }
    }

    async getJiraResource<T = Record<string, unknown>>(resourceUrl: string): Promise<T> {
        const response = await this.axiosInstance.get<T>(`/${resourceUrl}`);
        return response.data;
    }

    async postJiraResource(resourceUrl: string, data: unknown): Promise<Record<string, unknown>> {
        const opLog = this.log.child({ resourceUrl });
        try {
            const response = await this.axiosInstance.post(`/${resourceUrl}`, data);
            return response.data as Record<string, unknown>;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } };
            opLog.error(`Erro POST /${resourceUrl}: ${extractErrorMessage(err)}`, {
                status: axiosErr.response?.status,
                resourceUrl,
            });
            throw err;
        }
    }

    async putJiraResource(resourceUrl: string, data: unknown): Promise<Record<string, unknown> | null> {
        try {
            const response = await this.axiosInstance.put(`/${resourceUrl}`, data);
            return response.status === 204 ? null : (response.data as Record<string, unknown>);
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } };
            this.log.error(`Erro PUT /${resourceUrl}: ${extractErrorMessage(err)}`, {
                resourceUrl,
                status: axiosErr.response?.status,
            });
            throw err;
        }
    }

    async getProjectId(projectName: string): Promise<string> {
        try {
            const projectData = await this.getJiraResource<{ id: string }>(`project/${projectName}`);
            return projectData.id;
        } catch (err: unknown) {
            this.log.error(`Projeto '${projectName}' não encontrado: ${extractErrorMessage(err)}`);
            return '';
        }
    }

    async getProjectVersions(projectId: string): Promise<VersionData[]> {
        try {
            return await this.getJiraResource<VersionData[]>(`project/${projectId}/versions`);
        } catch (err: unknown) {
            this.log.error(`Erro ao buscar versões do projeto '${projectId}': ${extractErrorMessage(err)}`);
            return [];
        }
    }

    async getVersionId(projectName: string, versionName: string): Promise<string | null> {
        const projectId = await this.getProjectId(projectName);
        if (!projectId) {
            info(`Projeto '${projectName}' não encontrado.`);
            return null;
        }
        const versions = await this.getProjectVersions(projectId);
        if (!Array.isArray(versions) || versions.length === 0) {
            info(`Nenhuma versão encontrada para o projeto '${projectName}'.`);
            return null;
        }

        const version = versions.find((v) => v.name.toLowerCase() === versionName.toLowerCase());
        if (version) {
            return version.id;
        }
        info(`Versão '${versionName}' não encontrada no projeto '${projectName}'.`);
        return null;
    }

    async createVersion(
        projectName: string,
        versionName: string,
        description?: string,
    ): Promise<Record<string, unknown> | null> {
        const versionId = await this.getVersionId(projectName, versionName);
        if (versionId) {
            info(`Versão '${versionName}' ja existe.`);
            return null;
        }

        const payload = { description, name: versionName, project: projectName, released: false };

        info(`Criando versão: ${versionName}`);
        const response = await this.postJiraResource('version', payload);

        if (response) {
            success('Versão criada com sucesso: ' + (response.name as string));
        } else {
            logError('Falha ao criar versão.');
        }
        return response;
    }

    async checkReleaseTasksStatus(projectName: string, versionName: string): Promise<boolean> {
        try {
            const safeVersion = sanitizeJqlValue(versionName);
            const projectId = await this.getProjectId(projectName);
            const jql = `project = ${projectId} AND fixVersion = "${safeVersion}"`;

            const issuesData = await this.searchJiraIssues(jql);
            if (!issuesData || !issuesData.issues || issuesData.issues.length === 0) {
                info(`Nenhuma issue encontrada para versão '${versionName}' no projeto '${projectName}'.`);
                return false;
            }

            let allTasksCompleted = true;
            for (const issue of issuesData.issues) {
                const status = issue.fields?.status?.name || '';
                if (!['done', 'in use'].includes(status.toLowerCase())) {
                    info(` - Issue '${issue.key}' NAO concluída. Status: ${status}`);
                    allTasksCompleted = false;
                } else {
                    info(` - Issue '${issue.key}' concluída (Status: ${status}).`);
                }
            }

            return allTasksCompleted;
        } catch (err: unknown) {
            this.log.error(`Erro checkReleaseTasksStatus: ${extractErrorMessage(err)}`);
            return false;
        }
    }

    async getReleaseTasks(projectName: string, versionName: string, testOnly = false): Promise<string[]> {
        try {
            const safeVersion = sanitizeJqlValue(versionName);
            const projectId = await this.getProjectId(projectName);

            const typeFilter = testOnly ? ' AND type = "Test"' : '';
            const jql = `project = ${projectId} AND fixVersion = "${safeVersion}"${typeFilter}`;

            const issuesData = await this.searchJiraIssues(jql);
            if (!issuesData || !issuesData.issues || issuesData.issues.length === 0) {
                info(`Nenhuma issue encontrada para versão '${versionName}' no projeto '${projectName}'.`);
                return [];
            }

            return issuesData.issues.map((issue) => `[${issue.key}] - ${issue.fields.summary}`);
        } catch (err: unknown) {
            this.log.error(`Erro getReleaseTasks: ${extractErrorMessage(err)}`);
            return [];
        }
    }

    async getLatestReleases(
        projectName: string,
        numReleases: number,
    ): Promise<{
        latestReleasedVersions: VersionData[];
        unreleasedVersions: VersionData[];
    }> {
        const projectId = await this.getProjectId(projectName);
        if (!projectId) {
            info(`Projeto '${projectName}' não encontrado.`);
            return { latestReleasedVersions: [], unreleasedVersions: [] };
        }
        const allVersions = await this.getProjectVersions(projectId);
        if (!Array.isArray(allVersions) || allVersions.length === 0) {
            info(`Nenhuma versão encontrada para o projeto '${projectName}'.`);
            return { latestReleasedVersions: [], unreleasedVersions: [] };
        }

        const releasedVersions = allVersions
            .filter((v) => v.released && v.releaseDate)
            .sort((a, b) => new Date(b.releaseDate!).getTime() - new Date(a.releaseDate!).getTime());

        const latestReleasedVersions = releasedVersions.slice(0, numReleases);
        const unreleasedVersions = allVersions.filter((v) => !v.released);

        info(`Últimas ${latestReleasedVersions.length} versões lançadas do projeto '${projectName}':`);
        latestReleasedVersions.forEach((v) => {
            info(`Versão: ${v.name} (Data: ${v.releaseDate})`);
        });

        info("\nVersões não lançadas do projeto '" + projectName + "':");
        if (unreleasedVersions.length > 0) {
            unreleasedVersions.forEach((v) => {
                const description = v.description || 'Sem descrição';
                info(`Versão: ${v.name} (Descrição: ${description})`);
            });
        } else {
            info('Nenhuma versão não lancada encontrada.');
        }

        return { latestReleasedVersions, unreleasedVersions };
    }

    async addTasksToSprint(taskIds: string[], sprintId: string): Promise<void> {
        const payload = { issues: taskIds };

        try {
            info(`Adicionando ${taskIds.length} tarefa(s) a sprint ${sprintId}...`);
            await this.postJiraResource(`sprint/${sprintId}/issue`, payload);
            success('Tarefas adicionadas a sprint.');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } };
            this.log.error('Erro ao adicionar a sprint: ' + extractErrorMessage(err), {
                sprintId,
                taskCount: taskIds.length,
                status: axiosErr.response?.status,
            });
            throw err;
        }
    }

    async updateFixVersions(taskIds: string[], projectName: string, versionName: string): Promise<void> {
        const versionId = await this.getVersionId(projectName, versionName);
        if (!versionId) {
            this.log.error(`Versão '${versionName}' não encontrada no projeto '${projectName}'.`);
            return;
        }

        const payload = {
            update: { fixVersions: [{ set: [{ id: versionId }] }] },
        };

        const bar = new ProgressBar(taskIds.length);
        for (const taskId of taskIds) {
            await this.putJiraResource(`issue/${taskId}`, payload);
            bar.update(bar.current + 1);
        }
        bar.stop();
    }

    async releaseVersion(projectName: string, versionName: string): Promise<void> {
        const versionId = await this.getVersionId(projectName, versionName);
        if (!versionId) {
            this.log.error(`Versão '${versionName}' não encontrada, não é possível publicar.`);
            return;
        }

        const allTasksCompleted = await this.checkReleaseTasksStatus(projectName, versionName);
        if (!allTasksCompleted) {
            this.log.error(`Não é possível publicar versão '${versionName}', nem todas as tarefas estão concluídas.`);
            return;
        }

        const releaseDate = new Date().toISOString().split('T')[0];
        const payload = { releaseDate, released: true };

        info(`Publicando versão '${versionName}'...`);
        await this.putJiraResource(`version/${versionId}`, payload);
        success(`Versão '${versionName}' publicada.`);
    }

    async moveCardsToDone(taskIds: string[]): Promise<void> {
        const wf = this.workflowMap;

        for (const taskId of taskIds) {
            let issueData: { fields?: { status?: { name: string } } };
            try {
                issueData = await this.getJiraResource(`issue/${taskId}`);
            } catch {
                this.log.warn(`Pulando tarefa ${taskId}: não foi possível obter dados.`);
                continue;
            }
            if (!issueData.fields || !issueData.fields.status) {
                this.log.warn(`Pulando tarefa ${taskId}: dados incompletos.`);
                continue;
            }

            const currentStatus = issueData.fields.status.name;
            this.log.info(`Tarefa ${taskId} — status atual: ${currentStatus}`);

            const transitionsMap = await this.getTransitionsForIssue(taskId);
            if (Object.keys(transitionsMap).length === 0) {
                this.log.warn(`Não foi possível obter transições para ${taskId}. Pulando tarefa.`);
                continue;
            }

            const statusLower = currentStatus.toLowerCase();
            try {
                const targets = wf[statusLower];
                if (!targets) {
                    warn(`   ${taskId}: status "${currentStatus}" não mapeado para fechamento automatico.`);
                } else {
                    for (const target of targets) {
                        const transitionId = transitionsMap[target];
                        if (!transitionId) {
                            warn(`Transicao "${target}" não encontrada para ${taskId}. Verifique workflowMap.`);
                            continue;
                        }
                        this.log.info(`   ${taskId}: -> ${target}`);
                        await this.transitionIssue(taskId, transitionId);
                    }
                }
            } catch (err: unknown) {
                const axiosErr = err as { response?: { status?: number } };
                this.log.error(`Erro ao mover ${taskId}: ${extractErrorMessage(err)}`, {
                    status: axiosErr.response?.status,
                });
            }
        }
    }

    async transitionIssue(issueId: string, transitionId: string): Promise<void> {
        const payload = { transition: { id: transitionId } };
        this.log.info(`   Movendo ${issueId} (transicao ${transitionId})...`);

        try {
            await this.postJiraResource(`issue/${issueId}/transitions`, payload);
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } };
            this.log.error('Erro ao mover tarefa: ' + extractErrorMessage(err), {
                issueId,
                transitionId,
                status: axiosErr.response?.status,
            });
            throw err;
        }
    }
}

export = JiraResource;
