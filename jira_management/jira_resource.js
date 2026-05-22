// @ts-check
const { createHttpClient } = require('../shared/http-client');
const { error: logError, success, info, warn, extractErrorMessage, ProgressBar } = require('../shared/prompt');
const { Logger } = require('../shared/logger');

function sanitizeJqlValue(value) {
    if (!value || typeof value !== 'string') {
        throw new Error('Valor inválido para consulta JQL.');
    }
    return value.replace(/[^\w\s.:/-]/g, '');
}

class JiraResource {
    /** @param {string} personalToken @param {string} baseUrl */
    constructor(personalToken, baseUrl) {
        this.baseUrl = baseUrl;
        this.axiosInstance = createHttpClient({
            baseUrl,
            authHeader: { 'Authorization': `Bearer ${personalToken}` },
        });
        this.log = new Logger({ resource: 'JiraAPI' });
    }

    async searchJiraIssues(jql, maxResults = 200) {
        const MAX_PAGES = 1000;
        const MAX_TOTAL = 10000;
        let allIssues = [];
        let startAt = 0;
        let total = null;
        let pages = 0;

        while ((total === null || startAt < total) && pages < MAX_PAGES && allIssues.length < MAX_TOTAL) {
            pages++;
            const url = `search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&startAt=${startAt}`;
            const data = await this.getJiraResource(url);

            if (total === null) {
                total = data.total;
                if (total > 0) this.log.info(`Buscando ${total} issues...`);
                if (total > MAX_TOTAL) this.log.warn(`Total (${total}) excede limite de ${MAX_TOTAL}, truncando.`);
            }

            allIssues = allIssues.concat(data.issues || []);
            startAt += maxResults;
        }

        return { issues: allIssues, total: allIssues.length };
    }

    async getTransitionsForIssue(issueKey) {
        const data = await this.getJiraResource(`issue/${issueKey}/transitions`);
        if (!data || !data.transitions) return {};
        const map = {};
        for (const t of data.transitions) {
            if (t.to && t.to.name) {
                map[t.to.name.toLowerCase()] = t.id;
            }
        }
        return map;
    }

    /**
     * @param {string} resourceUrl
     * @returns {Promise<Object>}
     * @throws {Error} em falha de rede ou HTTP 4xx/5xx
     */
    async getJiraResource(resourceUrl) {
        const response = await this.axiosInstance.get(`/${resourceUrl}`);
        return response.data;
    }

    /**
     * @param {string} resourceUrl
     * @param {Object} data
     * @returns {Promise<Object>}
     * @throws {Error} em falha de rede ou HTTP 4xx/5xx
     */
    async postJiraResource(resourceUrl, data) {
        const opLog = this.log.child({ resourceUrl });
        try {
            const response = await this.axiosInstance.post(`/${resourceUrl}`, data);
            return response.data;
        } catch (err) {
            const status = err.response?.status;
            opLog.error(`Erro POST /${resourceUrl}: ${extractErrorMessage(err)}`, {
                status,
                resourceUrl
            });
            throw err;
        }
    }

    /**
     * @param {string} resourceUrl
     * @param {Object} data
     * @returns {Promise<Object|null>}
     * @throws {Error} em falha de rede ou HTTP 4xx/5xx
     */
    async putJiraResource(resourceUrl, data) {
        try {
            const response = await this.axiosInstance.put(`/${resourceUrl}`, data);
            return response.status === 204 ? null : response.data;
        } catch (err) {
            this.log.error(`Erro PUT /${resourceUrl}: ${extractErrorMessage(err)}`, {
                resourceUrl,
                status: err.response?.status
            });
            throw err;
        }
    }

    async getProjectId(projectName) {
        const projectData = await this.getJiraResource(`project/${projectName}`);
        return projectData.id;
    }

    async getProjectVersions(projectId) {
        return await this.getJiraResource(`project/${projectId}/versions`);
    }

    async getVersionId(projectName, versionName) {
        let projectId;
        try {
            projectId = await this.getProjectId(projectName);
        } catch {
            info(`Projeto '${projectName}' nao encontrado.`);
            return null;
        }
        let versions;
        try {
            versions = await this.getProjectVersions(projectId);
        } catch {
            info(`Nenhuma versão encontrada para o projeto '${projectName}'.`);
            return null;
        }
        if (!Array.isArray(versions)) {
            info(`Nenhuma versão encontrada para o projeto '${projectName}'.`);
            return null;
        }

        const version = versions.find(v => v.name.toLowerCase() === versionName.toLowerCase());
        if (version) {
            return version.id;
        }
        info(`Versão '${versionName}' nao encontrada no projeto '${projectName}'.`);
        return null;
    }

    async createVersion(projectName, versionName, description) {
        const versionId = await this.getVersionId(projectName, versionName);
        if (versionId) {
            info(`Versão '${versionName}' ja existe.`);
            return null;
        }

        const payload = { description, name: versionName, project: projectName, released: false };

        info(`Criando versão: ${versionName}`);
        const response = await this.postJiraResource('version', payload);

        if (response) {
            success('Versão criada com sucesso: ' + response.name);
        } else {
            logError('Falha ao criar versão.');
        }
        return response;
    }

    async checkReleaseTasksStatus(projectName, versionName) {
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
    }

    async getReleaseTasks(projectName, versionName, testOnly = false) {
        const safeVersion = sanitizeJqlValue(versionName);
        const projectId = await this.getProjectId(projectName);

        const typeFilter = testOnly ? ' AND type = "Test"' : '';
        const jql = `project = ${projectId} AND fixVersion = "${safeVersion}"${typeFilter}`;

        const issuesData = await this.searchJiraIssues(jql);
        if (!issuesData || !issuesData.issues || issuesData.issues.length === 0) {
            info(`Nenhuma issue encontrada para versão '${versionName}' no projeto '${projectName}'.`);
            return [];
        }

        return issuesData.issues.map(issue => `[${issue.key}] - ${issue.fields.summary}`);
    }

    async getLatestReleases(projectName, numReleases) {
        let projectId;
        try {
            projectId = await this.getProjectId(projectName);
        } catch {
            info(`Projeto '${projectName}' nao encontrado.`);
            return { latestReleasedVersions: [], unreleasedVersions: [] };
        }
        let allVersions;
        try {
            allVersions = await this.getProjectVersions(projectId);
        } catch {
            info(`Nenhuma versão encontrada para o projeto '${projectName}'.`);
            return { latestReleasedVersions: [], unreleasedVersions: [] };
        }
        if (!Array.isArray(allVersions)) {
            info(`Nenhuma versão encontrada para o projeto '${projectName}'.`);
            return { latestReleasedVersions: [], unreleasedVersions: [] };
        }

        const releasedVersions = allVersions
            .filter(v => v.released && v.releaseDate)
            .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());

        const latestReleasedVersions = releasedVersions.slice(0, numReleases);
        const unreleasedVersions = allVersions.filter(v => !v.released);

        info(`Últimas ${latestReleasedVersions.length} versoes lancadas do projeto '${projectName}':`);
        latestReleasedVersions.forEach(v => {
            info(`Versão: ${v.name} (Data: ${v.releaseDate})`);
        });

        info("\nVersoes nao lancadas do projeto '" + projectName + "':");
        if (unreleasedVersions.length > 0) {
            unreleasedVersions.forEach(v => {
                const description = v.description || 'Sem descrição';
                info(`Versão: ${v.name} (Descrição: ${description})`);
            });
        } else {
            info("Nenhuma versão nao lancada encontrada.");
        }

        return { latestReleasedVersions, unreleasedVersions };
    }

    async addTasksToSprint(taskIds, sprintId) {
        const payload = { issues: taskIds };

        try {
            info(`Adicionando ${taskIds.length} tarefa(s) a sprint ${sprintId}...`);
            await this.postJiraResource(`sprint/${sprintId}/issue`, payload);
            success('Tarefas adicionadas a sprint.');
        } catch (err) {
            this.log.error('Erro ao adicionar a sprint: ' + extractErrorMessage(err), {
                sprintId,
                taskCount: taskIds.length,
                status: err.response?.status
            });
        }
    }

    async updateFixVersions(taskIds, projectName, versionName) {
        const versionId = await this.getVersionId(projectName, versionName);
        if (!versionId) {
            this.log.error(`Versão '${versionName}' nao encontrada no projeto '${projectName}'.`);
            return;
        }

        const payload = {
            update: { fixVersions: [{ set: [{ id: versionId }] }] }
        };

        const bar = new ProgressBar(taskIds.length);
        for (const taskId of taskIds) {
            await this.putJiraResource(`issue/${taskId}`, payload);
            bar.update(bar.current + 1);
        }
        bar.stop();
    }

    async releaseVersion(projectName, versionName) {
        const versionId = await this.getVersionId(projectName, versionName);
        if (!versionId) {
            this.log.error(`Versão '${versionName}' nao encontrada, nao e possivel publicar.`);
            return;
        }

        const allTasksCompleted = await this.checkReleaseTasksStatus(projectName, versionName);
        if (!allTasksCompleted) {
            this.log.error(`Nao e possivel publicar versão '${versionName}', nem todas as tarefas estao concluídas.`);
            return;
        }

        const releaseDate = new Date().toISOString().split('T')[0];
        const payload = { releaseDate, released: true };

        info(`Publicando versão '${versionName}'...`);
        await this.putJiraResource(`version/${versionId}`, payload);
        success(`Versão '${versionName}' publicada.`);
    }

    /** @type {Object.<string, string[]>} */
    workflowMap = {
        'new': ['approve', 'use test case'],
        'coding in progress': ['coding done', 'done'],
        'coding done': ['done'],
        'approve': ['use test case'],
    };

    /** @param {string[]} taskIds */
    async moveCardsToDone(taskIds) {
        const wf = this.workflowMap;

        for (const taskId of taskIds) {
            let issueData;
            try {
                issueData = await this.getJiraResource(`issue/${taskId}`);
            } catch (err) {
                this.log.warn(`Pulando tarefa ${taskId}: nao foi possivel obter dados.`);
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
                this.log.warn(`Nao foi possivel obter transições para ${taskId}. Pulando tarefa.`);
                continue;
            }

            const statusLower = currentStatus.toLowerCase();
            try {
                const targets = wf[statusLower];
                if (!targets) {
                    warn(`   ${taskId}: status "${currentStatus}" nao mapeado para fechamento automatico.`);
                } else {
                    for (const target of targets) {
                        const transitionId = transitionsMap[target];
                        if (!transitionId) {
                            warn(`Transicao "${target}" nao encontrada para ${taskId}. Verifique workflowMap.`);
                            continue;
                        }
                        this.log.info(`   ${taskId}: -> ${target}`);
                        await this.transitionIssue(taskId, transitionId);
                    }
                }
            } catch (err) {
                this.log.error(`Erro ao mover ${taskId}: ${extractErrorMessage(err)}`, {
                    status: err.response?.status
                });
            }
        }
    }

    /** @param {string} issueId @param {number} transitionId */
    async transitionIssue(issueId, transitionId) {
        const payload = { transition: { id: transitionId } };
        this.log.info(`   Movendo ${issueId} (transicao ${transitionId})...`);

        try {
            await this.postJiraResource(`issue/${issueId}/transitions`, payload);
        } catch (err) {
            this.log.error('Erro ao mover tarefa: ' + extractErrorMessage(err), {
                issueId,
                transitionId,
                status: err.response?.status
            });
        }
    }
}

module.exports = JiraResource;
