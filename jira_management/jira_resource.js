const axios = require('axios');
const { createAgent } = require('../shared/tls');
const { error: logError, success, info, extractErrorMessage, Spinner } = require('../shared/prompt');
const { Logger } = require('../shared/logger');

const TRANSITIONS = {
    CODING_DONE: 61,
    DONE: 141,
    APPROVE: 21,
    USE_TEST_CASE: 41,
};

function sanitizeJqlValue(value) {
    if (!/^[\w\s.:/-]+$/.test(value)) {
        throw new Error(
            `Valor invalido para consulta JQL: "${value}". Use apenas letras, numeros, espacos, pontos, dois-pontos, barras e hifens.`
        );
    }
    return value;
}

class JiraResource {
    constructor(personalToken, baseUrl) {
        this.baseUrl = baseUrl;
        this.headers = {
            'Authorization': `Bearer ${personalToken}`,
            'Content-Type': 'application/json',
        };
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: this.headers,
            httpsAgent: createAgent()
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

    async getJiraResource(resourceUrl) {
        try {
            const response = await this.axiosInstance.get(`/${resourceUrl}`);
            return response.data;
        } catch (err) {
            this.log.error('Erro na consulta: ' + extractErrorMessage(err), {
                resourceUrl,
                status: err.response?.status
            });
        }
    }

    async postJiraResource(resourceUrl, data, maxRetries = 10) {
        let attempt = 0;
        const opLog = this.log.child({ resourceUrl });

        while (attempt < maxRetries) {
            try {
                const response = await this.axiosInstance.post(`/${resourceUrl}`, data);
                return response.data;
            } catch (err) {
                const status = err.response?.status;
                const message = extractErrorMessage(err).toLowerCase();

                const isRateLimit =
                    status === 429 ||
                    message.includes('rate limit') ||
                    message.includes('too many requests') ||
                    message.includes('econnreset');

                if (isRateLimit) {
                    const waitTime = 2000 * (attempt + 1);
                    opLog.warn(`Rate limit (tentativa ${attempt + 1}), aguardando ${waitTime}ms...`);
                    const spinner = new Spinner();
                    spinner.start(`Rate limit (tentativa ${attempt + 1}/${maxRetries}), aguardando ${waitTime}ms`);
                    await JiraResource.delay(waitTime);
                    spinner.stop();
                    attempt++;
                    continue;
                }

                opLog.error('Erro na criacao: ' + extractErrorMessage(err), {
                    status,
                    attempt: attempt + 1
                });
                throw err;
            }
        }

        opLog.error(`Falha apos ${maxRetries} tentativas (rate limit): ${resourceUrl}`);
    }

    async putJiraResource(resourceUrl, data) {
        try {
            const response = await this.axiosInstance.put(`/${resourceUrl}`, data);
            return response.status === 204 ? null : response.data;
        } catch (err) {
            this.log.error('Erro na atualizacao: ' + extractErrorMessage(err), {
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
            .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

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

    async moveCardsToDone(taskIds) {
        for (const taskId of taskIds) {
            const issueData = await this.getJiraResource(`issue/${taskId}`);
            if (!issueData || !issueData.fields || !issueData.fields.status) {
                this.log.warn(`Pulando tarefa ${taskId}: nao foi possivel obter o status.`);
                continue;
            }

            const currentStatus = issueData.fields.status.name;
            this.log.info(`Tarefa ${taskId} — status atual: ${currentStatus}`);

            const statusLower = currentStatus.toLowerCase();
            try {
                switch (statusLower) {
                    case 'coding in progress':
                        this.log.info(`   ${taskId}: Coding In Progress -> Coding Done`);
                        await this.transitionIssue(taskId, TRANSITIONS.CODING_DONE);
                        this.log.info(`   ${taskId}: Coding Done -> Done`);
                        await this.transitionIssue(taskId, TRANSITIONS.DONE);
                        break;

                    case 'coding done':
                        this.log.info(`   ${taskId}: Coding Done -> Done`);
                        await this.transitionIssue(taskId, TRANSITIONS.DONE);
                        break;

                    case 'new':
                        this.log.info(`   ${taskId}: New -> Approve`);
                        await this.transitionIssue(taskId, TRANSITIONS.APPROVE);
                        this.log.info(`   ${taskId}: Approve -> Use test case`);
                        await this.transitionIssue(taskId, TRANSITIONS.USE_TEST_CASE);
                        break;

                    case 'approve':
                        this.log.info(`   ${taskId}: Approve -> Use test case`);
                        await this.transitionIssue(taskId, TRANSITIONS.USE_TEST_CASE);
                        break;

                    default:
                        this.log.info(`   ${taskId}: nao esta em estado movivel.`);
                }
            } catch (err) {
                this.log.error(`Erro ao mover ${taskId}: ${extractErrorMessage(err)}`, {
                    status: err.response?.status
                });
            }
        }
    }

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
