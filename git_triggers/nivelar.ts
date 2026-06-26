/** Nivelar — automatically create a merge request to sync (level) branches in GitLab. */
import { ask, info, success, printError, withSpinner, warn } from '../shared/prompt.js';
import type { GitProvider } from '../shared/types.js';

async function createNivelamentoMr(
    gitlab: GitProvider,
    source: string,
    target: string,
    label: string,
    details: string[],
): Promise<void> {
    try {
        const mr = await withSpinner('Criando MR ' + source + ' -> ' + target + '...', () =>
            gitlab.createMergeRequest(
                source,
                target,
                'chore: nivelamento ' + source + ' -> ' + target,
                'Nivelamento automatico de branches: ' + source + ' -> ' + target,
            ),
        );
        if (mr) {
            const msg = label === 'primeiro' ? 'MR criado: ' : 'Segundo MR criado: ';
            (label === 'primeiro' ? info : success)(msg + String(mr.web_url));
            details.push(source + '->' + target + ':ok');
        }
    } catch (err) {
        printError('Falha no nivelamento (' + label + ' MR)', err);
        details.push(source + '->' + target + ':error');
    }
}

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
    const missing = branches.filter((_, i) => !Reflect.get(existing, i));
    if (missing.length > 0) {
        warn('Branch(es) não encontrada(s): ' + missing.join(', '));
        return;
    }

    const details: string[] = [];
    await createNivelamentoMr(gitlab, mainBranch, rcBranch, 'primeiro', details);
    await createNivelamentoMr(gitlab, rcBranch, devBranch, 'segundo', details);

    if (pushHistory) {
        const totalErr = details.filter((d) => d.endsWith(':error')).length;
        pushHistory('nivelamento', details.join(', '), totalErr === 0 ? 'ok' : 'error');
    }
}
