/** Cypress Dashboard API client: fetch enterprise report data (pass/fail rates per project). */
import { createHttpClient } from '../shared/http-client.js';
import { rootLogger } from '../shared/logger.js';
import { info, warn, success } from '../shared/prompt.js';
import { sanitizeUrl } from '../shared/cli_base.js';
import type { JsonObject } from '../shared/types.js';

interface CypressReportOptions {
    cypressUrl: string;
    cypressToken: string;
    startDate: string;
    branch?: string;
    projects?: string[];
}

class CypressResource {
    client: ReturnType<typeof createHttpClient>;

    constructor(baseUrl: string, personalToken: string) {
        this.client = createHttpClient({
            baseUrl,
            authHeader: { Authorization: `Bearer ${personalToken}` },
        });
    }

    async getCypressResource(resourceUrl: string, opts: { headers?: Record<string, string> } = {}): Promise<unknown> {
        try {
            const config: JsonObject = {};
            if (opts.headers) config['headers'] = opts.headers;
            const response = await this.client.get(resourceUrl, config);
            return response.data;
        } catch (err: unknown) {
            const axiosErr = err as { message: string };
            rootLogger.error(`Erro HTTP GET ${sanitizeUrl(resourceUrl)}: ${axiosErr.message}`, {
                resourceUrl: sanitizeUrl(resourceUrl),
            });
            return null;
        }
    }

    async fetchReport(opts: CypressReportOptions = { cypressUrl: '', cypressToken: '', startDate: '' }): Promise<void> {
        const { cypressUrl, cypressToken, startDate, branch = 'main', projects = [] } = opts;
        const report_id = 'status-per-test-daily';
        const format = 'json';

        const endpoint = `${cypressUrl}/enterprise-reporting/report?report_id=${report_id}&export_format=${format}&start_date=${startDate}&branch=${branch}&projects=__PROJECT__`;
        info(`Buscando relatorio Cypress (${projects.length} projeto(s))...`);

        for (const project of projects) {
            const url = endpoint.replace('__PROJECT__', project);
            const data = await this.getCypressResource(url, {
                headers: { Authorization: `Bearer ${cypressToken}` },
            });

            if (!Array.isArray(data)) {
                warn(`Resposta inválida para o projeto ${project}`);
                continue;
            }

            const items = data as Array<{ status: string; test_run_count: number }>;
            const passed = items.filter((item) => item.status === 'passed');
            const failed = items.filter((item) => item.status === 'failed');

            const avgPassed = passed.length
                ? passed.reduce((sum, item) => sum + item.test_run_count, 0) / passed.length
                : 0;
            const avgFailed = failed.length
                ? failed.reduce((sum, item) => sum + item.test_run_count, 0) / failed.length
                : 0;
            const total = avgPassed + avgFailed;
            const pctPassed = total ? ((avgPassed / total) * 100).toFixed(2) : '0.00';

            success(
                `${project}: ${pctPassed}% passed (${avgPassed.toFixed(2)} avg pass / ${avgFailed.toFixed(2)} avg fail)`,
            );
        }
    }
}

export default CypressResource;
