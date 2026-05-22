// @ts-check
const { success, error, warn, info, title, printSummary } = require('../../shared/prompt');
const { sanitizeUrl } = require('../../shared/cli_base');

/** @param {import('./context').CommandContext} c */
async function handler(c) {
    title('Diagnostico de Conexao');
    const diagResults = [];
    const endpoints = [
        { url: sanitizeUrl(c.base_url + '/rest/api/2/myself'), label: 'Jira API' },
        { url: sanitizeUrl(c.base_url), label: 'Xray API' },
        { url: sanitizeUrl(c.base_url + '/rest/api/2/project/' + c.ctx.project_name), label: 'Projeto ' + c.ctx.project_name }
    ];
    for (const ep of endpoints) {
        const start = Date.now();
        try {
            const resp = await c.jiraResource.axiosInstance.get(ep.url);
            const ms = Date.now() - start;
            info(ep.label + ': ' + resp.status + ' (' + ms + 'ms)');
            diagResults.push({ status: 'ok', label: ep.label, message: ms + 'ms' });
        } catch (err) {
            const ms = Date.now() - start;
            const st = err.response?.status || 'ERR';
            if (st === 401 || st === 403) {
                warn(ep.label + ': ' + st + ' (token pode estar inválido)');
            } else {
                error(ep.label + ': ' + st + ' (' + ms + 'ms)');
            }
            diagResults.push({ status: 'error', label: ep.label, message: st + ' ' + ms + 'ms' });
        }
    }
    printSummary(
        /** @type {import('../../shared/types').TestResult[]} */ (diagResults));
    c.pushHistory('diagnostico',
        diagResults.filter(r => r.status === 'ok').length + '/' + diagResults.length + ' ok',
        diagResults.some(r => r.status === 'error') ? 'error' : 'ok');
}

module.exports = { handler };
