import { success, warn, prompt } from '../../shared/prompt';
import { update as updateState } from '../../shared/state';
import type { CommandContext } from './context';

function handler(c: CommandContext): boolean | void {
    const newName = prompt('Novo nome do projeto Jira').toUpperCase().trim();
    if (!newName) {
        warn('Nome do projeto não pode ser vazio.');
        return;
    }
    c.ctx.project_name = newName;
    c.ctx.lastOperation = 'Projeto alterado para ' + c.ctx.project_name;
    c.pushHistory('trocar-projeto', c.ctx.project_name, 'ok');
    updateState((state) => {
        state.lastProject = c.ctx.project_name;
    });
    success('Projeto alterado para: ' + c.ctx.project_name);
}

export = { handler };
