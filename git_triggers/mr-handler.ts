import path from 'path';
import { print, success, warn, info, prompt, confirm, printError, withSpinner, divider } from '../shared/prompt';
import { SessionContext } from '../shared/session-context';
import type { GitProvider, MergeRequestInfo } from '../shared/types';
import { currentProvider, pushHistory } from './session-state';
import { generatePrDescription } from './ai-pr-desc';
import { assessTestImpact } from './ai-test-impact';
import { nivelarBranches } from './nivelar';
import Config from '../shared/config';

export async function nivelarBranchesWrapper(gitlab: GitProvider) {
    await nivelarBranches(gitlab, { pushHistory });
}

export async function handleCreateMR(ctx: SessionContext, m: GitProvider) {
    const sourceBranch = prompt('Branch de origem');
    const targetBranch = prompt('Branch de destino');
    const mrTitle = prompt('Titulo do ' + (currentProvider === 'github' ? 'PR' : 'MR'));
    let description = '';
    if (confirm('Gerar descrição com IA?', false)) {
        const aiDesc = await generatePrDescription(m, sourceBranch, targetBranch);
        if (aiDesc) {
            info('Descrição gerada por IA.');
            description = aiDesc;
        } else {
            warn('IA não retornou descrição. Insira manualmente.');
        }
    }
    if (!description) {
        description = prompt('Descrição');
    }
    if (confirm('Analisar impacto nos testes com IA?', false)) {
        const cypressDir = Config.cypressProjectPath || '';
        const mappingPath = cypressDir ? path.resolve(cypressDir, '*jira-mapping.json') : '';
        const impact = await assessTestImpact(m, sourceBranch, targetBranch, mappingPath || undefined);
        if (impact) {
            info('Impacto nos testes:');
            divider();
            print(impact);
            divider();
            pushHistory('test-impact', sourceBranch + '->' + targetBranch, 'ok');
        } else {
            warn('IA não retornou análise de impacto.');
        }
    }
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    try {
        const result = await withSpinner(
            'Criando ' + prLabel + ' ' + sourceBranch + ' -> ' + targetBranch + '...',
            () => m.createMergeRequest(sourceBranch, targetBranch, mrTitle, description),
        );
        if (result) {
            success(prLabel + ' criado: ' + String(result.web_url));
            pushHistory('pr-create', sourceBranch + '->' + targetBranch, 'ok');
        }
    } catch (err) {
        printError('Falha ao criar ' + prLabel, err);
        pushHistory('pr-create', sourceBranch + '->' + targetBranch, 'error');
    }
}

export async function handleListApprovedMRs(ctx: SessionContext, m: GitProvider) {
    const status = prompt('Status dos ' + (currentProvider === 'github' ? 'PRs' : 'MRs'), { default: 'opened' });
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    try {
        const results = await m.searchMergeRequests('', '', status);
        const approved: MergeRequestInfo[] = [];
        for (const r of results) {
            if (
                typeof m.isApproved === 'function' &&
                (await m.isApproved((r.iid as string | number) || (r.number as string | number)))
            ) {
                approved.push(r);
            }
        }
        if (approved.length > 0) {
            info(prLabel + 's aprovados:');
            approved.forEach((r) =>
                print('  ' + prLabel + ' #' + (String(r.iid) || String(r.number)) + ': ' + String(r.title)),
            );
            pushHistory('prs-approved', approved.length + ' ' + prLabel + 's', 'ok');
        } else {
            warn('Nenhum ' + prLabel + ' aprovado encontrado.');
            pushHistory('prs-approved', 'vazio', 'ok');
        }
    } catch (err) {
        printError('Erro ao listar ' + prLabel + 's aprovados', err);
        pushHistory('prs-approved', status, 'error');
    }
}

export async function handleMergeMR(ctx: SessionContext, m: GitProvider) {
    const iid = prompt('ID do ' + (currentProvider === 'github' ? 'PR' : 'MR') + ' para merge');
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    try {
        const result = await withSpinner('Fazendo merge de ' + prLabel + ' #' + iid + '...', () =>
            m.acceptMergeRequest(iid),
        );
        if (result) {
            success('Merge realizado: ' + String(result.web_url));
            pushHistory('pr-merge', iid, 'ok');
        }
    } catch (err) {
        printError('Falha ao fazer merge', err);
        pushHistory('pr-merge', iid, 'error');
    }
}
