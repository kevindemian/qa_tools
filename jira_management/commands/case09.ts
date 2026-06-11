/** Change the active Jira project name. */
import { success, warn, ask } from '../../shared/prompt.js';
import { update as updateState } from '../../shared/state.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const newName = (await ask('Novo nome do projeto Jira', { hint: 'ex: NOVO-PROJ' })).toUpperCase().trim();
    if (!newName) {
        warn('Nome do projeto não pode ser vazio.');
        return;
    }
    c.ctx.project_name = newName;
    c.ctx.lastOperation = 'Projeto alterado para ' + c.ctx.project_name;
    c.pushHistory('trocar-projeto', c.ctx.project_name, 'ok');
    updateState((state) => {
        state['lastProject'] = c.ctx.project_name;
    });
    success('Projeto alterado para: ' + c.ctx.project_name);
}

export default { handler };
