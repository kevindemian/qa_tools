/** AI Feedback handler — view records, summary stats, and recent generation history. */
import { warn, title, divider, tableView, showSelect } from '../../shared/prompt.js';
import { getAiFeedbackSummary, getRecentAiRecords } from '../../shared/ai-feedback.js';
import type { CommandContext } from './context.js';

function showFeedbackSummary(): void {
    const summary = getAiFeedbackSummary();
    if (summary.totalRecords === 0) {
        warn('Nenhum registro de feedback de IA encontrado.');
        return;
    }
    title('Feedback de IA — Resumo');
    tableView(
        [
            { Métrica: 'Total de registros', Valor: summary.totalRecords },
            { Métrica: 'Testes gerados', Valor: summary.totalGenerated },
            { Métrica: 'Modificados', Valor: summary.totalModified },
            { Métrica: 'Deletados', Valor: summary.totalDeleted },
            { Métrica: 'Taxa de aceitação', Valor: summary.acceptanceRate + '%' },
            { Métrica: 'Prompt version líder', Valor: summary.topPromptVersion || '—' },
        ],
        ['Métrica', 'Valor'],
    );
}

function showRecentRecords(): void {
    const recent = getRecentAiRecords(10);
    if (recent.length === 0) {
        warn('Nenhum registro recente.');
        return;
    }
    title('Registros recentes');
    const rows = recent.map((r) => ({
        ID: r.id.slice(0, 16),
        Data: r.generatedAt.slice(0, 10),
        Versão: r.promptVersion,
        Testes: r.generatedTests.length,
        'User Story': r.userStory.slice(0, 50),
    }));
    tableView(rows, ['ID', 'Data', 'Versão', 'Testes', 'User Story']);
}

async function handler(_c: CommandContext): Promise<boolean | void> {
    while (true) {
        title('Feedback de IA');
        const choice = await showSelect('Selecione uma opção', [
            { name: 'Resumo de feedback', value: 'a' },
            { name: 'Registros recentes', value: 'b' },
            { name: 'Voltar', value: '0' },
        ]);

        if (choice === '0') return;

        if (choice === 'a') {
            showFeedbackSummary();
        } else if (choice === 'b') {
            showRecentRecords();
        }

        divider();
    }
}

export default { handler };
