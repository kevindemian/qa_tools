import { warn, confirm, smartPrompt, printError, printSummary } from '../../shared/prompt';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const version = smartPrompt('Versão a publicar', {}, () => {});
    if (!confirm('Publicar versão ' + version + '? Isso marcara a versão como released.')) {
        warn('Operação cancelada.');
        return true;
    }
    try {
        await c.jiraResource.releaseVersion(c.ctx.project_name, version);
        printSummary([{ status: 'ok' as const, label: 'Versão ' + version, message: 'Publicada com sucesso' }]);
        c.ctx.lastOperation = 'Versão ' + version + ' publicada';
        c.pushHistory('publicar-versão', version, 'ok');
    } catch (err: unknown) {
        printError('Erro ao publicar versão', err);
        c.pushHistory('publicar-versão', 'erro', 'error');
    }
    return false;
}

export { handler };
module.exports = { handler };
