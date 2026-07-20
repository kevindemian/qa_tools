import { getDataHub } from '../../shared/data-hub/global-hub.js';
import { calcFlakinessEntries } from '../../shared/data-hub/compute/flakiness-entries.js';
import { calculateHealthScore } from '../../shared/quality/health-score.js';
import { calculateReleaseScore, generateReleaseScoreHtml } from '../../shared/quality/release-score.js';
import { info, warn, title, printError } from '../../shared/ui/prompt.js';
import { openWithFallback } from '../../shared/open.js';
import { writeReport } from '../../shared/infra/temp-dir.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Release Score');
    const projectName = c.ctx.project_name;
    if (!projectName) {
        warn('Nenhum projeto Jira selecionado.');
        return;
    }

    try {
        const hub = getDataHub();
        const projectRuns = (hub.computed.metricsRuns ?? []).filter((r) => r.project === projectName);

        const health = calculateHealthScore({ dataHub: hub });
        const flaky = calcFlakinessEntries(projectRuns.length >= 2 ? projectRuns : [], 2);

        const coveragePct = hub.computed.coverage;
        const releaseScore = calculateReleaseScore(
            undefined,
            health.overall,
            health.overall >= 70 ? 'pass' : 'fail',
            coveragePct,
            flaky.length > 0
                ? Math.min(100, Math.round((flaky.filter((f) => f.rate > 0.3).length / flaky.length) * 100))
                : 0,
        );

        const html = generateReleaseScoreHtml(releaseScore);
        const filePath = writeReport('release-score-' + projectName + '.html', html);
        await openWithFallback(filePath, 'Release Score', info);

        c.pushHistory('release-score', projectName, 'ok');
    } catch (err: unknown) {
        printError('Erro ao gerar Release Score', err);
    }
}

export default { handler };
