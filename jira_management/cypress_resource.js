const https = require('https');
const path = require('path');
const readlineSync = require('readline-sync');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const cypress_url = process.env.CYPRESS_BASE_URL;
const cypress_token = process.env.CYPRESS_TOKEN;
let start_date = readlineSync.question(`\nInsert report start date (ex: 2025-05-01): `);
const branch = 'main';
const report_id = 'status-per-test-daily';
const format = 'json';
const projects = ['iBabs', 'Integritylog', 'IRManager', 'IBABS_AWS', 'InsiderLog', 'iBABS_Cast', 'iBabs_Smart_Debrief'];

class CypressResource {
    async getCypressResource(resourceUrl) {

        return new Promise((resolve, reject) => {
            https.get(resourceUrl, (res) => {
                let data = '';

                // If status code is not 200, reject early
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP status code ${res.statusCode}`));
                    res.resume(); // Consume response data to free up memory
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
            console.error('HTTP error occurred:', err.message);
            return null;
        });
    }
}

(async () => {

    const cypressResource = new CypressResource();

    const endpoint = `${cypress_url}/enterprise-reporting/report?token=${cypress_token}&report_id=${report_id}&export_format=${format}&start_date=${start_date}&branch=${branch}&projects=__PROJECT__`;
    console.log(`\nRequest URL: ${endpoint.replace(cypress_token,'xxx')}`);
    console.log(`Start date from: ${start_date}`);
    console.log(`Branch: ${branch}`);
    console.log(`Report: ${report_id}`);
    console.log(`Format: ${format}`);


    for (const project of projects) {

        const data = await cypressResource.getCypressResource(endpoint.replace('__PROJECT__', project));

        if (!Array.isArray(data)) {
            console.error(`Invalid response for project: ${project}`);
            continue;
        }

        const passed = data.filter(item => item.status === 'passed');
        const failed = data.filter(item => item.status === 'failed');

        const avgPassed = passed.reduce((sum, item) => sum + item.test_run_count, 0) / passed.length || 0;
        const avgFailed = failed.reduce((sum, item) => sum + item.test_run_count, 0) / failed.length || 0;
        const total = avgPassed + avgFailed;
        const pctPassed = total ? ((avgPassed / total) * 100).toFixed(2) : '0.00';

        console.log(`\nProject: ${project}`);
        console.log(`   Average Passed: ${avgPassed.toFixed(2)}`);
        console.log(`   Average Failed: ${avgFailed.toFixed(2)}`);
        console.log(`   % Passed: ${pctPassed}%`);
    }
})();
