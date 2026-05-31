/** First-run wizard — detects first-time usage and offers guided setup.
 * Skips automatically when:
 *   - CI=true or AUTO_CONFIRM=true (headless automation)
 *   - --batch or --auto flags present (headless execution)
 *   - state.history already exists (returning user)
 *   - SKIP_FIRST_RUN=true env var is set
 * Once acknowledged, stores a flag in state so it never shows again. */
import { title, info, divider, warn, showSelect } from './prompt';
import { loadTypedState, update as updateState } from './state';

const FIRST_RUN_FLAG = '_firstRunDone';

function _isBatchOrCI(): boolean {
    if (process.env.CI === 'true') return true;
    if (process.env.AUTO_CONFIRM === 'true') return true;
    if (process.env.SKIP_FIRST_RUN === 'true') return true;
    const args = process.argv.slice(2).join(' ');
    if (args.includes('--batch') || args.includes('--auto')) return true;
    return false;
}

/** Returns true if this is a first run (no history, no flag). */
export function isFirstRun(): boolean {
    if (_isBatchOrCI()) return false;
    const state = loadTypedState();
    if ((state as Record<string, unknown>)[FIRST_RUN_FLAG]) return false;
    if (state.history && state.history.length > 0) return false;
    return true;
}

/** Mark first-run as acknowledged so it never reappears. */
export function _markFirstRunDone(): void {
    updateState((s) => {
        s[FIRST_RUN_FLAG] = true;
    });
}

/** Run the first-run wizard: shows welcome, offers setup wizard or docs.
 * Should be called after environment validation but before the main loop. */
export async function maybeRunFirstRunWizard(): Promise<void> {
    if (!isFirstRun()) return;

    title('Bem-vindo ao QA Tools!');
    info('Parece que é sua primeira execução.');
    divider();
    info('O QA Tools integra testes com Jira/Xray e automatiza pipelines CI/CD.');
    info('Antes de começar, verifique se o arquivo .env está configurado.');
    divider();

    const choice = await showSelect('O que você deseja fazer?', [
        { name: 'Executar setup wizard (configura CI/CD + Jira)', value: 'setup' },
        { name: 'Ver documentação completa', value: 'docs' },
        { name: 'Começar a usar (pular)', value: 'skip' },
    ]);

    if (choice === 'setup') {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const setupModule = require('../../setup/main') as { default: { main: () => Promise<void> } };
            await setupModule.default.main();
        } catch {
            warn('Não foi possível iniciar o setup wizard.');
        }
    } else if (choice === 'docs') {
        try {
            const { showDocs } = await import('./show-docs.js');
            await showDocs();
        } catch (err: unknown) {
            warn('Não foi possível abrir a documentação: ' + (err as Error).message);
        }
    }

    _markFirstRunDone();
}
