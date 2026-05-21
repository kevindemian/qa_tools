// @ts-check
const path = require('path');
const { createHttpClient } = require('../shared/http-client');
const { rootLogger } = require('../shared/logger');
const { info, warn, success } = require('../shared/prompt');
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

    /** @param {string} resourceUrl @param {Object} [opts] */
    async getCypressResource(resourceUrl, opts = {}) {
        try {
            const config = {};
            if (opts.headers) config.headers = opts.headers;
            const response = await this.client.get(resourceUrl, config);
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

        const endpoint = `${cypressUrl}/enterprise-reporting/report?report_id=${report_id}&export_format=${format}&start_date=${startDate}&branch=${branch}&projects=__PROJECT__`;
        info(`Buscando relatorio Cypress (${projects.length} projeto(s))...`);

        for (const project of projects) {
            const url = endpoint.replace('__PROJECT__', project);
            const data = await this.getCypressResource(url, {
                headers: { 'Authorization': `Bearer ${cypressToken}` }
            });

            if (!Array.isArray(data)) {
                warn(`Resposta invalida para o projeto ${project}`);
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

            success(`${project}: ${pctPassed}% passed (${avgPassed.toFixed(2)} avg pass / ${avgFailed.toFixed(2)} avg fail)`);
        }
    }
}

module.exports = CypressResource;
