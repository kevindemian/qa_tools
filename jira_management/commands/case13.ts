import { success, error, warn, info, prompt, confirm, printError } from '../../shared/prompt';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<void> {
    let keys: string[] = [];
    if (c.ctx.inMemoryTasksId.length > 0) {
        info('Testes da sessão atual: ' + c.ctx.inMemoryTasksId.join(', '));
        if (confirm('Usar estes ' + c.ctx.inMemoryTasksId.length + ' testes?', true)) {
            keys = c.ctx.inMemoryTasksId;
        }
    }
    if (keys.length === 0) {
        const input = prompt('Keys dos testes (separadas por espaco)', { hint: 'ex: TEST-1 TEST-2' });
        keys = input.split(/\s+/).filter(Boolean);
    }
    if (keys.length === 0) {
        warn('Nenhuma key informada.');
        return;
    }
    const nameInput = prompt('Nome da execução', { hint: 'Enter = "Automated Execution"' });
    const csvName = nameInput.trim() || '';
    const execTitle = prompt('Titulo do Test Execution', { hint: 'Enter = ' + (csvName || 'Automated Execution') });
    const execDesc = prompt('Descrição (opcional)');
    const createTestExecutionWithLinks = require('../create_tests').createTestExecutionWithLinks;
    try {
        const execResult = await createTestExecutionWithLinks(
            c.jiraResource, c.linkManager, c.ctx.project_name, keys, csvName,
            { title: execTitle, description: execDesc }
        );
        c.pushHistory('create-testexec', execResult.key, 'ok');
    } catch (err) {
        printError('Erro ao criar Test Execution', err);
        c.pushHistory('create-testexec', 'erro', 'error');
    }
}

export { handler };
module.exports = { handler };
