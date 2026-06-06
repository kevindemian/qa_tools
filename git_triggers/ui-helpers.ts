/** UI helpers — branch formatting, interactive menus, and project-selection prompts. */
import { stripVTControlCharacters } from 'util';
import type { JsonObject } from '../shared/types.js';
import { title, warn, divider, ask, tableView } from '../shared/prompt.js';
import { load as loadState } from '../shared/state.js';
import { defaultOutput } from '../shared/output.js';

const MSG_NO_OPERATION_RECORDED = 'Nenhuma operação registrada.';

function providerLabel(currentProvider: 'gitlab' | 'github'): string {
    return currentProvider === 'github' ? 'GitHub' : 'GitLab';
}

async function handleHelp(): Promise<void> {
    defaultOutput.box(
        [
            'Ajuda — Opções disponíveis no menu numerado acima.',
            '',
            '  /history  - Exibe histórico de operações da sessão.',
            '  /docs     - Abre documentação completa no navegador.',
            '  /help     - Esta ajuda.',
            '  /exit     - Sair do programa.',
            '  /back     - Voltar ao menu principal.',
        ],
        { border: 'double', padding: 1, title: 'Ajuda — Git Tools' },
    );
    divider();
    await ask('Pressione Enter para continuar');
}

async function handleShowHistory(): Promise<void> {
    const state = loadState() as { history?: JsonObject[] };
    const history = state.history ?? [];
    title('Histórico de operações');
    const last10 = history.slice(-10);
    if (last10.length === 0) {
        warn(MSG_NO_OPERATION_RECORDED);
    } else {
        tableView(last10, ['ts', 'op', 'detail', 'status']);
    }
    divider();
    await ask('Pressione Enter para continuar');
}

function formatBranch(branch: string): string {
    return stripVTControlCharacters(branch);
}

export { MSG_NO_OPERATION_RECORDED, providerLabel, handleHelp, handleShowHistory, formatBranch };
