import { warn, info, ask, askConfirm } from '../../shared/prompt';
import type { CommandContext } from './context';
import { createTestExecutionWithLinksWrapper } from './helpers';

async function handler(c: CommandContext): Promise<boolean | void> {
    let keys: string[] = [];
    if (c.ctx.inMemoryTasksId.length > 0) {
        info('Testes da sessão atual: ' + c.ctx.inMemoryTasksId.join(', '));
        if (await askConfirm('Usar estes ' + c.ctx.inMemoryTasksId.length + ' testes?', true)) {
            keys = c.ctx.inMemoryTasksId;
        }
    }
    if (keys.length === 0) {
        const input = await ask('Keys dos testes (separadas por espaco)', { hint: 'ex: TEST-1 TEST-2' });
        keys = input.split(/\s+/).filter(Boolean);
    }
    if (keys.length === 0) {
        warn('Nenhuma key informada.');
        return;
    }
    const nameInput = await ask('Nome da execução', { hint: 'Enter = "Automated Execution"' });
    const csvName = nameInput.trim() || '';
    const execTitle = await ask('Titulo do Test Execution', { hint: 'Enter = ' + (csvName || 'Automated Execution') });
    const execDesc = await ask('Descrição (opcional)');
    await createTestExecutionWithLinksWrapper(c, keys, csvName, execTitle, execDesc);
}

export default { handler };
