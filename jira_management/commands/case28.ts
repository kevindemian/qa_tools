/**
 * Case 28: Associate tests to existing Test Execution
 *
 * Reuses the existing offerTestExecutionAssociation function from test-execution-flow.ts.
 * This provides a CLI-accessible entry point for the interactive association flow.
 */
import { title, warn, info, ask, printError, success } from '../../shared/ui/prompt.js';
import { offerTestExecutionAssociation } from './test-execution-flow.js';
import type { CommandContext } from './context.js';
import Config from '../../shared/config-accessor.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Associar Testes a Test Execution');

    // Get test keys from config or prompt
    let testKeysInput = Config.get('targetKeys') || '';
    if (!testKeysInput) {
        testKeysInput = await ask('Chaves dos testes (separadas por vírgula):');
        if (!testKeysInput) {
            warn('Operação cancelada.');
            return false;
        }
    }

    const testKeys = testKeysInput.split(',').map((k: string) => k.trim()).filter(Boolean);
    if (testKeys.length === 0) {
        warn('Nenhuma chave de teste fornecida.');
        return false;
    }

    // Get source name for tracking
    const srcName = Config.get('csvPath') || 'manual-association';

    try {
        // Reuse the existing association flow
        const result = await offerTestExecutionAssociation(c, testKeys, srcName);

        if (result.associated) {
            success(`Testes associados a ${result.key} — ${result.summary}`);
            c.pushHistory('associate-te', `${result.key}: ${testKeys.join(', ')}`, 'ok');
        } else {
            info('Associação cancelada ou pulada.');
        }
    } catch (err) {
        printError('Erro ao associar testes', err);
        return false;
    }
}

export default { handler };
