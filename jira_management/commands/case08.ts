import { warn, askConfirm, ask, printError, printSummary } from '../../shared/prompt';
import type { CommandContext } from './context';
import { OPERATION_CANCELLED } from '../constants';

async function handler(c: CommandContext): Promise<boolean | void> {
    const version = await ask('Versão a publicar', {});
    if (!(await askConfirm('Publicar versão ' + version + '? Isso marcara a versão como released.'))) {
        warn(OPERATION_CANCELLED);
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

export default { handler };
