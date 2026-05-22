import { warn, info, prompt, confirm } from '../../shared/prompt';
import type { CommandContext } from './context';
import { createTestExecutionWithLinksWrapper } from './helpers';

async function handler(c: CommandContext): Promise<boolean | void> {
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
    await createTestExecutionWithLinksWrapper(c, keys, csvName, execTitle, execDesc);
}

export { handler };
module.exports = { handler };
