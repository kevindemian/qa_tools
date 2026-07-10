import { getDataHub } from '../../shared/data-hub/global-hub.js';
import { buildTraceabilityMatrix, generateTraceabilityHtml } from '../../shared/traceability-matrix.js';
import { info, warn, title, printError } from '../../shared/prompt.js';
import { openWithFallback } from '../../shared/open.js';
import { writeReport } from '../../shared/temp-dir.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Traceability Matrix');
    const projectName = c.ctx.project_name;
    if (!projectName) {
        warn('Nenhum projeto Jira selecionado.');
        return;
    }

    try {
        const store = getDataHub().loadMetricsStore();
        const matrix = buildTraceabilityMatrix(store);

        const html = generateTraceabilityHtml(matrix, 'Traceability Matrix — ' + projectName);
        const filePath = writeReport('traceability-matrix-' + projectName + '.html', html);
        await openWithFallback(filePath, 'Traceability Matrix', info);

        c.pushHistory('traceability-matrix', projectName, 'ok');
    } catch (err: unknown) {
        printError('Erro ao gerar Traceability Matrix', err);
    }
}

export default { handler };
