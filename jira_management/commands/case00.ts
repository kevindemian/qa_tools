/** Init Wizard — launch the CI/CD setup wizard from within the Jira management menu. */
import { info, printError, title, divider } from '../../shared/prompt';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Setup Wizard');
    info('Iniciando wizard de configuração de CI/CD...');
    divider();

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const setupModule = require('../../setup/main') as { default: { main: () => Promise<void> } };
        await setupModule.default.main();
    } catch (err: unknown) {
        printError('Erro ao executar setup wizard', err);
        return false;
    }

    c.pushHistory('setup-wizard', 'wizard concluído', 'ok');
}

export default { handler };
