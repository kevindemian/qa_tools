import { loadMetrics, calculateFlakiness } from '../../shared/metrics.js';
import { calculateHealthScore } from '../../shared/health-score.js';
import { calculateReleaseScore, generateReleaseScoreHtml } from '../../shared/release-score.js';
import { info, warn, title, printError } from '../../shared/prompt.js';
import { openWithFallback } from '../../shared/open.js';
import { writeReport } from '../../shared/temp-dir.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Release Score');
    const projectName = c.ctx.project_name;
    if (!projectName) {
        warn('Nenhum projeto Jira selecionado.');
        return;
    }

    try {
        const store = loadMetrics();
        const projectRuns = store.runs.filter((r) => r.project === projectName);

        const health = calculateHealthScore(store);
        const flaky = calculateFlakiness(projectRuns.length >= 2 ? { runs: projectRuns } : { runs: [] }, 2);

        const releaseScore = calculateReleaseScore(
            80,
            health.overall ?? 50,
            health.overall >= 70 ? 'pass' : 'fail',
            70,
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
