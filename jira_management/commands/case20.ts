/** Interactive bug-report flow — collect details and create Jira issue. */

import { ask, askConfirm, info, printError, title } from '../../shared/prompt.js';
import { collectManual, generateBugReportFromDescription, interactiveBugReportFlow } from '../../shared/bug-report.js';
import type { CommandContext } from './context.js';
import type { BugReport } from '../../shared/types.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Bug Report');
    try {
        const useAi = await askConfirm('Usar IA para gerar o report a partir de uma descrição? (recomendado)', true);

        let report: BugReport;

        if (useAi) {
            const raw = await ask('Descreva o bug em linguagem natural');
            if (raw.trim().length < 20) {
                const proceed = await askConfirm(
                    'Descrição muito curta. A IA pode não gerar um report preciso. Continuar?',
                    false,
                );
                if (!proceed) return;
            }

            const aiReport = await generateBugReportFromDescription(raw);
            if (!aiReport) {
                printError('Falha ao gerar report com IA', new Error('generateBugReportFromDescription returned null'));
                info('Retornando ao fluxo manual...');
                report = await collectManual();
            } else {
                const linkedInput = await ask('Issues relacionadas (KEY-123, KEY-456) — opcional');
                if (linkedInput.trim()) {
                    aiReport.linkedIssues = linkedInput.split(',').map((k) => ({
                        key: k.trim().toUpperCase(),
                        linkType: 'Relates',
                    }));
                }
                report = aiReport;
            }
        } else {
            report = await collectManual();
        }

        const result = await interactiveBugReportFlow(c.jiraResource, c.ctx.project_name, report, c.linkManager);
        if (result?.status === 'ok') {
            c.pushHistory('bug-report', `${result.label}: ${result.message}`, 'ok');
        }
    } catch (e) {
        printError('Erro ao criar bug report', e);
    }
}

export default { handler };
