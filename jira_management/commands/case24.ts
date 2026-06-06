/** Setup wizard / Primeiros passos — launches the first-run wizard on demand.
 *  Offers guided setup (CI/CD), documentation, or skip.
 *  Never auto-detects — only accessible via menu option 24. */
import { info, printError } from '../../shared/prompt.js';
import { maybeRunFirstRunWizard } from '../../shared/first-run.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    info('Abrindo assistente de primeiros passos...');
    try {
        await maybeRunFirstRunWizard();
    } catch (err: unknown) {
        printError('Erro ao executar wizard', err);
        return false;
    }
    c.pushHistory('setup-wizard', 'wizard concluído', 'ok');
}

export default { handler };
