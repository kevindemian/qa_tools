const https = require('https');
const path = require('path');
const { rootLogger } = require('../shared/logger');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

class CypressResource {
    async getCypressResource(resourceUrl) {
        return new Promise((resolve, reject) => {
            https.get(resourceUrl, (res) => {
                let data = '';

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP status code ${res.statusCode}`));
                    res.resume();
                    return;
                }

                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (err) {
                        reject(new Error('Failed to parse JSON response'));
                    }
                });
            }).on('error', (err) => {
                reject(err);
            });
        }).catch(err => {
            rootLogger.error('Erro HTTP: ' + err.message, { resourceUrl });
            return null;
        });
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

            const avgPassed = passed.reduce((sum, item) => sum + item.test_run_count, 0) / passed.length || 0;
            const avgFailed = failed.reduce((sum, item) => sum + item.test_run_count, 0) / failed.length || 0;
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
