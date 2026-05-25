import { ask, info, success, printError, withSpinner, warn } from '../shared/prompt';
import type { GitProvider } from '../shared/types';

export async function nivelarBranches(
    gitlab: GitProvider,
    opts: { pushHistory?: (op: string, detail: string, status: string) => void } = {},
) {
    const { pushHistory } = opts;
    const mainBranch = await ask('Branch principal', { default: 'main' });
    const rcBranch = await ask('Branch release candidate', { default: 'rel_cand' });
    const devBranch = await ask('Branch dev', { default: 'dev' });
    if (!mainBranch || !rcBranch || !devBranch) {
        warn('Todas as branches devem ser preenchidas.');
        return;
    }
    if (mainBranch === rcBranch || rcBranch === devBranch || mainBranch === devBranch) {
        warn('Branches devem ser diferentes entre si.');
        return;
    }
    const branches = [mainBranch, rcBranch, devBranch];
    const existing = await Promise.all(branches.map((b) => gitlab.getBranch(b)));
    const missing = branches.filter((_, i) => !existing[i]);
    if (missing.length > 0) {
        warn('Branch(es) não encontrada(s): ' + missing.join(', '));
        return;
    }
    const details: string[] = [];

    {
        try {
            const mr1 = await withSpinner('Criando MR ' + mainBranch + ' -> ' + rcBranch + '...', () =>
                gitlab.createMergeRequest(
                    mainBranch,
                    rcBranch,
                    'chore: nivelamento ' + mainBranch + ' -> ' + rcBranch,
                    'Nivelamento automatico de branches: ' + mainBranch + ' -> ' + rcBranch,
                ),
            );
            if (mr1) {
                info('MR criado: ' + String(mr1.web_url));
                details.push(mainBranch + '->' + rcBranch + ':ok');
            }
        } catch (err) {
            printError('Falha no nivelamento (primeiro MR)', err);
            details.push(mainBranch + '->' + rcBranch + ':error');
        }
    }

    {
        try {
            const mr2 = await withSpinner('Criando MR ' + rcBranch + ' -> ' + devBranch + '...', () =>
                gitlab.createMergeRequest(
                    rcBranch,
                    devBranch,
                    'chore: nivelamento ' + rcBranch + ' -> ' + devBranch,
                    'Nivelamento automatico de branches: ' + rcBranch + ' -> ' + devBranch,
                ),
            );
            if (mr2) {
                success('Segundo MR criado: ' + String(mr2.web_url));
                details.push(rcBranch + '->' + devBranch + ':ok');
            }
        } catch (err) {
            printError('Falha no nivelamento (segundo MR)', err);
            details.push(rcBranch + '->' + devBranch + ':error');
        }
    }

    if (pushHistory) {
        const totalErr = details.filter((d) => d.endsWith(':error')).length;
        pushHistory('nivelamento', details.join(', '), totalErr === 0 ? 'ok' : 'error');
    }
}
