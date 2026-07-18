/** Setup wizard handler for the Git Triggers module.
 * Launches the CI/CD setup wizard that generates GitHub Actions workflows,
 * GitLab CI configs, project config files, and git hooks.
 * Previously located in jira_management/commands/case00.ts — moved here
 * during Sprint N UX restructuring. */
import { title, info, divider, printError } from '../shared/ui/prompt.js';
import { pushHistory } from './session-state.js';
import { main as setupMain } from '../setup/main.js';

/** Execute the CI/CD setup wizard and record the result in session history.
 * @returns false on success (continues the menu loop), false also on error
 *          (error is printed but the session continues). */
export async function handleSetupWizard(): Promise<boolean> {
    title('Setup Wizard');
    info('Iniciando wizard de configuração de CI/CD...');
    divider();

    let success = false;
    try {
        await setupMain();
        success = true;
    } catch (err: unknown) {
        printError('Erro ao executar setup wizard', err);
    }

    if (success) {
        pushHistory('setup-wizard', 'wizard concluído', 'ok');
    }
    return false;
}
