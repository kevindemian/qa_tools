/** Associate existing test issues to an existing Test Execution. */
import { warn, info, ask, title, divider } from '../../shared/ui/prompt.js';
import type { CommandContext } from './context.js';
import TestExecutionCreator from '../test-execution-creator.js';
import { formatErr } from '../../shared/errors.js';
import { rootLogger } from '../../shared/logger.js';
import type { JiraResourceLike } from '../../shared/types.js';

async function resolveTestKeys(c: CommandContext): Promise<string[]> {
    let keys: string[] = [];
    if (c.ctx.inMemoryTasksId.length > 0) {
        info('Testes da sessão atual: ' + c.ctx.inMemoryTasksId.join(', '));
        const useSession = await ask('Usar estes ' + c.ctx.inMemoryTasksId.length + ' testes? (s/N)', {
            hint: 's = usar sessão, N = digitar keys',
        });
        if (useSession.trim().toLowerCase() === 's') {
            keys = c.ctx.inMemoryTasksId;
        }
    }
    if (keys.length === 0) {
        const input = await ask('Keys dos testes (separadas por vírgula ou espaço)', {
            hint: 'ex: ECSPOL-1605,ECSPOL-1606 ou ECSPOL-1605 ECSPOL-1606',
        });
        keys = input
            .split(/[,\s]+/)
            .map((k) => k.trim().toUpperCase())
            .filter(Boolean);
    }
    return keys;
}

interface TeIssue {
    key: string;
    fields: { summary?: string; issuetype?: { name: string } };
}

async function validateTeIssue(jiraResource: JiraResourceLike, teKey: string): Promise<TeIssue | null> {
    let teIssue: TeIssue;
    try {
        teIssue = await jiraResource.getJiraResource<TeIssue>('issue/' + teKey);
    } catch (err: unknown) {
        rootLogger.error('Test Execution não encontrada: ' + teKey + ' — ' + formatErr(err));
        warn('Issue ' + teKey + ' não encontrada no Jira.');
        return null;
    }
    if (teIssue.fields.issuetype?.name !== 'Test Execution') {
        const actualType = teIssue.fields.issuetype?.name || 'desconhecido';
        rootLogger.error('"' + teKey + '" não é uma Test Execution (tipo: ' + actualType + ')');
        warn('"' + teKey + '" não é Test Execution (tipo: ' + actualType + ')');
        return null;
    }
    return teIssue;
}

async function validateTestKeys(jiraResource: JiraResourceLike, keys: string[]): Promise<string[] | null> {
    const validKeys: string[] = [];
    const invalidKeys: string[] = [];
    for (const key of keys) {
        try {
            await jiraResource.getJiraResource<{ key: string }>('issue/' + key);
            validKeys.push(key);
        } catch (err: unknown) {
            rootLogger.error('Issue não encontrada: ' + key + ' — ' + formatErr(err));
            invalidKeys.push(key);
        }
    }

    if (invalidKeys.length > 0) {
        warn(invalidKeys.length + ' issue(s) não encontrada(s): ' + invalidKeys.join(', '));
        if (validKeys.length === 0) {
            warn('Nenhum teste válido. Operação cancelada.');
            return null;
        }
        info('Continuando com ' + validKeys.length + ' teste(s) válido(s)...');
    }

    return validKeys;
}

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Associar testes a Test Execution existente');

    const teKey = (await ask('Key da Test Execution', { hint: 'ex: ECSPOL-1624' })).trim().toUpperCase();
    if (!teKey) {
        warn('Nenhuma key informada.');
        return;
    }

    const keys = await resolveTestKeys(c);
    if (keys.length === 0) {
        warn('Nenhuma key informada.');
        return;
    }

    divider();
    info('TE: ' + teKey);
    info('Testes (' + keys.length + '): ' + keys.join(', '));
    divider();

    const teIssue = await validateTeIssue(c.jiraResource, teKey);
    if (!teIssue) return;

    const validKeys = await validateTestKeys(c.jiraResource, keys);
    if (!validKeys) return;

    try {
        const executor = new TestExecutionCreator(c.jiraResource, c.linkManager);
        const result = await executor.addTestsToExistingExecution(teKey, validKeys);
        if (!result) {
            c.pushHistory('associate-te', 'erro', 'error');
            warn('Falha ao associar testes à ' + teKey);
            return;
        }
        c.pushHistory('associate-te', result.key + ' (' + validKeys.length + ' testes)', 'ok');
        info('OK  ' + validKeys.length + ' teste(s) associado(s) à ' + result.key + ' — ' + result.summary);
    } catch (err: unknown) {
        rootLogger.error('Erro ao associar testes: ' + formatErr(err));
        c.pushHistory('associate-te', 'erro', 'error');
        warn('Erro ao associar testes à ' + teKey + ': ' + formatErr(err));
    }
}

export default { handler };
