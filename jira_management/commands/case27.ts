import { analyzeCoverageGaps } from '../../shared/report/coverage-gap.js';
import { generateCoverageGapHtml } from '../../shared/report/generate-coverage-gap-html.js';
import { info, warn, title, printError, withSpinner } from '../../shared/ui/prompt.js';
import { openWithFallback } from '../../shared/open.js';
import { writeReport } from '../../shared/infra/temp-dir.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Coverage Dashboard');
    const projectName = c.ctx.project_name;
    if (!projectName) {
        warn('Nenhum projeto Jira selecionado.');
        return;
    }

    let result;
    try {
        result = await withSpinner('Analisando cobertura...', () => analyzeCoverageGaps(c.jiraResource, projectName));
    } catch (err: unknown) {
        printError('Erro ao analisar cobertura', err);
        return false;
    }

    try {
        const html = generateCoverageGapHtml(result, 'Coverage Dashboard — ' + projectName);
        const filePath = writeReport('coverage-dashboard-' + projectName + '.html', html);
        await openWithFallback(filePath, 'Coverage Dashboard', info);

        c.pushHistory(
            'coverage-dashboard',
            result.totals.rawCoveragePct + '% coverage, ' + result.totals.gap + ' gaps',
            'ok',
        );
    } catch (err: unknown) {
        printError('Erro ao gerar Coverage Dashboard', err);
    }
}

export default { handler };
