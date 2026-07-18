/** Create a Test Execution for existing test issues (standalone flow). */
import { warn, info, ask, askConfirm } from '../../shared/ui/prompt.js';
import type { CommandContext } from './context.js';
import { offerTestExecutionAssociation, showResults } from './test-execution-flow.js';

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
    const teResult = await offerTestExecutionAssociation(c, keys, 'standalone');
    await showResults(c, keys, teResult);
}

export default { handler };
