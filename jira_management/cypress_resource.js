// @ts-check
const path = require('path');
const { createHttpClient } = require('../shared/http-client');
const { rootLogger } = require('../shared/logger');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

class CypressResource {
    /** @param {string} baseUrl @param {string} personalToken */
    constructor(baseUrl, personalToken) {
        this.baseUrl = baseUrl;
        this.personalToken = personalToken;
        this.client = createHttpClient({ baseUrl: '/' });
    }

    /** @param {string} resourceUrl */
    async getCypressResource(resourceUrl) {
        try {
            const response = await this.client.get(resourceUrl);
            return response.data;
        } catch (err) {
            rootLogger.error(`Erro HTTP GET ${resourceUrl}: ${err.message}`, { resourceUrl });
            return null;
        }
    }

    async fetchReport({ cypressUrl, cypressToken, startDate, branch = 'main', projects = [] } = {}) {
        const report_id = 'status-per-test-daily';
        const format = 'json';

        const endpoint = `${cypressUrl}/enterprise-reporting/report?token=${cypressToken}&report_id=${report_id}&export_format=${format}&start_date=${startDate}&branch=${branch}&projects=__PROJECT__`;

        for (const project of projects) {
            const data = await this.getCypressResource(endpoint.replace('__PROJECT__', project));

            if (!Array.isArray(data)) {
                rootLogger.error('Resposta invalida para o projeto: ' + project);
                continue;
            }

            const passed = data.filter(item => item.status === 'passed');
            const failed = data.filter(item => item.status === 'failed');

            const avgPassed = passed.length
                ? passed.reduce((sum, item) => sum + item.test_run_count, 0) / passed.length
                : 0;
            const avgFailed = failed.length
                ? failed.reduce((sum, item) => sum + item.test_run_count, 0) / failed.length
                : 0;
            const total = avgPassed + avgFailed;
            const pctPassed = total ? ((avgPassed / total) * 100).toFixed(2) : '0.00';

            rootLogger.info(`Projeto: ${project}`);
            rootLogger.info(`   Passed medio: ${avgPassed.toFixed(2)}`);
            rootLogger.info(`   Failed medio: ${avgFailed.toFixed(2)}`);
            rootLogger.info(`   % Passed: ${pctPassed}%`);
        }
    }
}

module.exports = CypressResource;
