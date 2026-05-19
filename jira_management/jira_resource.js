// @ts-check
const { createHttpClient } = require('../shared/http-client');
const { error: logError, success, info, warn, extractErrorMessage } = require('../shared/prompt');
const { Logger } = require('../shared/logger');

function sanitizeJqlValue(value) {
    if (!/^[\w\s.:/-]+$/.test(value)) {
        throw new Error(
            `Valor invalido para consulta JQL: "${value}". Use apenas letras, numeros, espacos, pontos, dois-pontos, barras e hifens.`
        );
    }
    return value;
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

    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async searchJiraIssues(jql, maxResults = 200) {
        let allIssues = [];
        let startAt = 0;
        let total = null;

        while (total === null || startAt < total) {
            const url = `search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&startAt=${startAt}`;
            const data = await this.getJiraResource(url);

            if (!data) break;

            if (total === null) {
                total = data.total;
                if (total > 0) this.log.info(`Buscando ${total} issues...`);
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

    /** @param {string} resourceUrl @returns {Promise<Object|null>} */
    async getJiraResource(resourceUrl) {
        try {
            const response = await this.axiosInstance.get(`/${resourceUrl}`);
            return response.data;
        } catch (err) {
            this.log.error(`Erro GET /${resourceUrl}: ${extractErrorMessage(err)}`, {
                resourceUrl,
                status: err.response?.status
            });
            return null;
        }
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

    /** @param {string} resourceUrl @param {Object} data @returns {Promise<Object|null>} */
    async putJiraResource(resourceUrl, data) {
        try {
            const response = await this.axiosInstance.put(`/${resourceUrl}`, data);
            return response.status === 204 ? null : response.data;
        } catch (err) {
            this.log.error(`Erro PUT /${resourceUrl}: ${extractErrorMessage(err)}`, {
                resourceUrl,
                status: err.response?.status
            });
        }
    }

    async getProjectId(projectName) {
        const projectData = await this.getJiraResource(`project/${projectName}`);
        return projectData ? projectData.id : null;
    }

    async getProjectVersions(projectId) {
        return await this.getJiraResource(`project/${projectId}/versions`);
    }

    async getVersionId(projectName, versionName) {
        const projectId = await this.getProjectId(projectName);
        const versions = await this.getProjectVersions(projectId);

        const version = versions.find(v => v.name.toLowerCase() === versionName.toLowerCase());
        if (version) {
            return version.id;
        }
        info(`Versao '${versionName}' nao encontrada no projeto '${projectName}'.`);
        return null;
    }

    async createVersion(projectName, versionName, description) {
        const versionId = await this.getVersionId(projectName, versionName);
        if (versionId) {
            info(`Versao '${versionName}' ja existe.`);
            return null;
        }

        const payload = { description, name: versionName, project: projectName, released: false };

        info(`Criando versao: ${versionName}`);
        const response = await this.postJiraResource('version', payload);

        if (response) {
            success('Versao criada com sucesso: ' + response.name);
        } else {
            logError('Falha ao criar versao.');
        }
        return response;
    }

    async checkReleaseTasksStatus(projectName, versionName) {
        const safeVersion = sanitizeJqlValue(versionName);
        const projectId = await this.getProjectId(projectName);
        const jql = `project = ${projectId} AND fixVersion = "${safeVersion}"`;

        const issuesData = await this.searchJiraIssues(jql);
        if (!issuesData || !issuesData.issues || issuesData.issues.length === 0) {
            info(`Nenhuma issue encontrada para versao '${versionName}' no projeto '${projectName}'.`);
            return false;
        }

        let allTasksCompleted = true;
        for (const issue of issuesData.issues) {
            const status = issue.fields.status.name;
            if (!['done', 'in use'].includes(status.toLowerCase())) {
                info(` - Issue '${issue.key}' NAO concluida. Status: ${status}`);
                allTasksCompleted = false;
            } else {
                info(` - Issue '${issue.key}' concluida (Status: ${status}).`);
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
            info(`Nenhuma issue encontrada para versao '${versionName}' no projeto '${projectName}'.`);
            return [];
        }

        return issuesData.issues.map(issue => `[${issue.key}] - ${issue.fields.summary}`);
    }

    async getLatestReleases(projectName, numReleases) {
        const projectId = await this.getProjectId(projectName);
        const allVersions = await this.getProjectVersions(projectId);

        const releasedVersions = allVersions
            .filter(v => v.released && v.releaseDate)
            .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());

        const latestReleasedVersions = releasedVersions.slice(0, numReleases);
        const unreleasedVersions = allVersions.filter(v => !v.released);

        info(`Ultimas ${latestReleasedVersions.length} versoes lancadas do projeto '${projectName}':`);
        latestReleasedVersions.forEach(v => {
            info(`Versao: ${v.name} (Data: ${v.releaseDate})`);
        });

        info("\nVersoes nao lancadas do projeto '" + projectName + "':");
        if (unreleasedVersions.length > 0) {
            unreleasedVersions.forEach(v => {
                const description = v.description || 'Sem descricao';
                info(`Versao: ${v.name} (Descricao: ${description})`);
            });
        } else {
            info("Nenhuma versao nao lancada encontrada.");
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
            this.log.error(`Versao '${versionName}' nao encontrada no projeto '${projectName}'.`);
            return;
        }

        const payload = {
            update: { fixVersions: [{ set: [{ id: versionId }] }] }
        };

        for (const taskId of taskIds) {
            info(`Atualizando tarefa: ${taskId}`);
            await this.putJiraResource(`issue/${taskId}`, payload);
        }
    }

    async releaseVersion(projectName, versionName) {
        const versionId = await this.getVersionId(projectName, versionName);
        if (!versionId) {
            this.log.error(`Versao '${versionName}' nao encontrada, nao e possivel publicar.`);
            return;
        }

        const allTasksCompleted = await this.checkReleaseTasksStatus(projectName, versionName);
        if (!allTasksCompleted) {
            this.log.error(`Nao e possivel publicar versao '${versionName}', nem todas as tarefas estao concluidas.`);
            return;
        }

        const releaseDate = new Date().toISOString().split('T')[0];
        const payload = { releaseDate, released: true };

        info(`Publicando versao '${versionName}'...`);
        await this.putJiraResource(`version/${versionId}`, payload);
        success(`Versao '${versionName}' publicada.`);
    }

    /** @param {string[]} taskIds */
    async moveCardsToDone(taskIds) {
        let transitionsMap = {};

        for (const taskId of taskIds) {
            const issueData = await this.getJiraResource(`issue/${taskId}`);
            if (!issueData || !issueData.fields || !issueData.fields.status) {
                this.log.warn(`Pulando tarefa ${taskId}: nao foi possivel obter o status.`);
                continue;
            }

            const currentStatus = issueData.fields.status.name;
            this.log.info(`Tarefa ${taskId} — status atual: ${currentStatus}`);

            if (Object.keys(transitionsMap).length === 0) {
                transitionsMap = await this.getTransitionsForIssue(taskId);
                if (Object.keys(transitionsMap).length === 0) {
                    this.log.warn(`Nao foi possivel obter transicoes para ${taskId}. Pulando todas as tarefas.`);
                    return;
                }
            }

            const statusLower = currentStatus.toLowerCase();
            try {
                switch (statusLower) {
                    case 'coding in progress': {
                        const toCodingDone = transitionsMap['coding done'];
                        const toDone = transitionsMap['done'];
                        if (!toCodingDone || !toDone) {
                            warn(`Transicao nao encontrada para ${taskId} (Coding In Progress -> Done). Verifique o workflow.`);
                            break;
                        }
                        this.log.info(`   ${taskId}: Coding In Progress -> Coding Done`);
                        await this.transitionIssue(taskId, toCodingDone);
                        this.log.info(`   ${taskId}: Coding Done -> Done`);
                        await this.transitionIssue(taskId, toDone);
                        break;
                    }

                    case 'coding done': {
                        const toDone = transitionsMap['done'];
                        if (!toDone) {
                            warn(`Transicao nao encontrada para ${taskId} (Coding Done -> Done).`);
                            break;
                        }
                        this.log.info(`   ${taskId}: Coding Done -> Done`);
                        await this.transitionIssue(taskId, toDone);
                        break;
                    }

                    case 'new': {
                        const toApprove = transitionsMap['approve'];
                        const toUseTestCase = transitionsMap['use test case'];
                        if (!toApprove || !toUseTestCase) {
                            warn(`Transicao nao encontrada para ${taskId} (New -> Use Test Case). Verifique os nomes das transicoes.`);
                            break;
                        }
                        this.log.info(`   ${taskId}: New -> Approve`);
                        await this.transitionIssue(taskId, toApprove);
                        this.log.info(`   ${taskId}: Approve -> Use test case`);
                        await this.transitionIssue(taskId, toUseTestCase);
                        break;
                    }

                    case 'approve': {
                        const toUseTestCase = transitionsMap['use test case'];
                        if (!toUseTestCase) {
                            warn(`Transicao nao encontrada para ${taskId} (Approve -> Use Test Case).`);
                            break;
                        }
                        this.log.info(`   ${taskId}: Approve -> Use test case`);
                        await this.transitionIssue(taskId, toUseTestCase);
                        break;
                    }

                    default:
                        warn(`   ${taskId}: status "${currentStatus}" nao mapeado para fechamento automatico.`);
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
