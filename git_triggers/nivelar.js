const { prompt, info, success, printError, withSpinner } = require('../shared/prompt');

/**
 * @param {import('../shared/types').GitProvider} gitlab
 * @param {{ pushHistory?: (op: string, detail: string, status: string) => void }} [opts]
 */
async function nivelarBranches(gitlab, opts = {}) {
    const { pushHistory } = opts;
    const mainBranch = prompt('Branch principal', { default: 'main' });
    const rcBranch = prompt('Branch release candidate', { default: 'rel_cand' });
    const devBranch = prompt('Branch dev', { default: 'dev' });
    let okCount = 0;
    let errCount = 0;
    const details = [];

    {
        try {
            const mr1 = await withSpinner('Criando MR ' + mainBranch + ' -> ' + rcBranch + '...', () => gitlab.createMergeRequest(
                mainBranch, rcBranch,
                'chore: nivelamento ' + mainBranch + ' -> ' + rcBranch,
                'Nivelamento automatico de branches: ' + mainBranch + ' -> ' + rcBranch
            ));
            if (mr1) { info('MR criado: ' + mr1.web_url); okCount++; details.push(mainBranch + '->' + rcBranch + ':ok'); }
        } catch (err) {
            printError('Falha no nivelamento (primeiro MR)', err);
            errCount++; details.push(mainBranch + '->' + rcBranch + ':error');
        }
    }

    {
        try {
            const mr2 = await withSpinner('Criando MR ' + rcBranch + ' -> ' + devBranch + '...', () => gitlab.createMergeRequest(
                rcBranch, devBranch,
                'chore: nivelamento ' + rcBranch + ' -> ' + devBranch,
                'Nivelamento automatico de branches: ' + rcBranch + ' -> ' + devBranch
            ));
            if (mr2) { success('Segundo MR criado: ' + mr2.web_url); okCount++; details.push(rcBranch + '->' + devBranch + ':ok'); }
        } catch (err) {
            printError('Falha no nivelamento (segundo MR)', err);
            errCount++; details.push(rcBranch + '->' + devBranch + ':error');
        }
    }

    if (pushHistory) {
        pushHistory('nivelamento', details.join(', '), errCount === 0 ? 'ok' : 'error');
    }
}

module.exports = { nivelarBranches };
