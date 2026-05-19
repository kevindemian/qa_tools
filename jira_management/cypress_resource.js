// @ts-check
const path = require('path');
const { createHttpClient } = require('../shared/http-client');
const { rootLogger } = require('../shared/logger');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function sanitizeUrl(url) {
    return url.replace(/token=[^&]+/, 'token=****');
}

class CypressResource {
    /** @param {string} baseUrl @param {string} personalToken */
    constructor(baseUrl, personalToken) {
        this.client = createHttpClient({
            baseUrl,
            authHeader: { 'Authorization': `Bearer ${personalToken}` },
        });
    }

    /** @param {string} resourceUrl */
    async getCypressResource(resourceUrl) {
        try {
            const response = await this.client.get(resourceUrl);
            return response.data;
        } catch (err) {
            rootLogger.error(`Erro HTTP GET ${sanitizeUrl(resourceUrl)}: ${err.message}`, { resourceUrl: sanitizeUrl(resourceUrl) });
            return null;
        }
    }

    /** @param {{ cypressUrl: string, cypressToken: string, startDate: string, branch?: string, projects?: string[] }} [opts] */
    async fetchReport({ cypressUrl, cypressToken, startDate, branch = 'main', projects = [] } = { cypressUrl: '', cypressToken: '', startDate: '' }) {
        const report_id = 'status-per-test-daily';
        const format = 'json';

        const endpoint = `${cypressUrl}/enterprise-reporting/report?token=${cypressToken}&report_id=${report_id}&export_format=${format}&start_date=${startDate}&branch=${branch}&projects=__PROJECT__`;
        rootLogger.info(`Fetching report: ${sanitizeUrl(endpoint)}`);

        for (const project of projects) {
            const url = endpoint.replace('__PROJECT__', project);
            const data = await this.getCypressResource(url);

            if (!Array.isArray(data)) {
                rootLogger.error(`Resposta invalida para o projeto ${project} de ${sanitizeUrl(url)}`);
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
