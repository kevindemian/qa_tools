import type { JsonObject } from '../shared/types';
import { title, warn, divider, ask, tableView } from '../shared/prompt';
import { load as loadState } from '../shared/state';
import { defaultOutput } from '../shared/output';

const MSG_NO_OPERATION_RECORDED = 'Nenhuma operação registrada.';

function providerLabel(currentProvider: 'gitlab' | 'github'): string {
    return currentProvider === 'github' ? 'GitHub' : 'GitLab';
}

async function handleHelp() {
    defaultOutput.box(
        [
            'Ajuda — Opções disponíveis no menu numerado acima.',
            '',
            '  /history  - Exibe histórico de operações da sessão.',
            '  /docs     - Documentação.',
            '  /help     - Esta ajuda.',
            '  /exit     - Sair do programa.',
            '  /back     - Voltar ao menu principal.',
        ],
        { border: 'double', padding: 1, title: 'Ajuda — Git Tools' },
    );
    divider();
    await ask('Pressione Enter para continuar');
}

async function handleShowHistory() {
    const history = (loadState().history as JsonObject[]) || [];
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
    // eslint-disable-next-line no-control-regex -- ANSI escape sequence
    return branch.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export { MSG_NO_OPERATION_RECORDED, providerLabel, handleHelp, handleShowHistory, formatBranch };
