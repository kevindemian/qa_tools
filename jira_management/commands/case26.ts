import { getDataHub } from '../../shared/data-hub/global-hub.js';
import { generateReleaseScoreHtml } from '../../shared/quality/release-score-renderer.js';
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
        const releaseScore = hub.computed.releaseScore;

        const html = generateReleaseScoreHtml(releaseScore);
        const filePath = writeReport('release-score-' + projectName + '.html', html);
        await openWithFallback(filePath, 'Release Score', info);

        c.pushHistory('release-score', projectName, 'ok');
    } catch (err: unknown) {
        printError('Erro ao gerar Release Score', err);
    }
}

export default { handler };
