/** Test impact analysis — three-tier impact from git diff, with flaky footnote and cross-feature hints. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import { ask, info, warn, title, divider, tableView, printError } from '../../shared/prompt.js';
import { analyzeTestImpact } from '../../shared/test-impact.js';
import { getDataHub } from '../../shared/data-hub/global-hub.js';
import { calcFlakinessEntries } from '../../shared/data-hub/compute/flakiness-entries.js';
import type { CommandContext } from './context.js';

const GIT_BIN = '/usr/bin/git';

function _getGitDiff(range: string): string | null {
    try {
        return execFileSync(GIT_BIN, ['diff', '--name-only', range], { encoding: 'utf8' }).toString().trim();
    } catch (err: unknown) {
        printError(
            'Não foi possível obter o git diff. Verifique se o repositório tem commits suficientes no branch atual ou forneça um range manual diferente.',
            err,
        );
        return null;
    }
}

function _showImpactSummary(result: ReturnType<typeof analyzeTestImpact>): void {
    title('TEST IMPACT ANALYSIS');
    tableView(
        [
            { name: 'Changed', value: result.changedFiles.join(', ') },
            { name: 'Impactados', value: `${result.impactedTests.length} tests (de ${result.unaffected.total})` },
            { name: 'Confiança', value: result.confidence },
        ],
        ['name', 'value'],
    );
}

function _showImpactedTests(result: ReturnType<typeof analyzeTestImpact>): void {
    if (result.impactedTests.length === 0) return;
    divider();
    const modeLabel: Record<string, string> = {
        mapping: 'mapping mode',
        keyword: 'keyword mode',
        vitest_find_related: 'high',
    };
    const rows = result.impactedTests.map((t) => ({
        Key: t.testKey ?? '-',
        Title: t.title,
        Mode: modeLabel[t.matchMode] ?? t.matchMode,
    }));
    tableView(rows, ['Key', 'Title', 'Mode']);
}

function _preloadTestKeys(result: ReturnType<typeof analyzeTestImpact>, c: CommandContext): void {
    const impactedTestKeys = result.impactedTests.map((t) => t.testKey).filter(Boolean) as string[];
    if (impactedTestKeys.length === 0) return;
    c.ctx.inMemoryTasksId.push(...impactedTestKeys);
    divider();
    info(impactedTestKeys.length + ' test(s) pré-carregado(s) para criar Test Execution (opção 13).');
}

function _showFlakyWarning(result: ReturnType<typeof analyzeTestImpact>): void {
    const hub = getDataHub();
    const store = hub.loadMetricsStore();
    const flakyTests = calcFlakinessEntries(store.runs, 2);
    const impactedTileSet = new Set(result.impactedTests.map((t) => t.title));
    const flakyHits = flakyTests.filter((f) => impactedTileSet.has(f.title));
    if (flakyHits.length === 0) return;
    divider();
    warn(flakyHits.length + ' teste(s) impactado(s) têm histórico flaky — revisar resultados manualmente.');
}

async function handler(c: CommandContext): Promise<boolean | void> {
    const range = (await ask('Git range (default: HEAD~1):', { hint: 'ex: HEAD~3..HEAD' })) || 'HEAD~1';
    const diff = _getGitDiff(range);
    if (diff === null) return false;
    if (!diff) {
        info('Nenhuma alteração encontrada.');
        return false;
    }

    const mappingPath = 'config/test-mapping.json';
    const resolvedMappingPath = fs.existsSync(mappingPath) ? mappingPath : undefined;
    const result = analyzeTestImpact(diff, { ...(resolvedMappingPath ? { mappingPath: resolvedMappingPath } : {}) });

    _showImpactSummary(result);
    _showImpactedTests(result);

    if (result.suggestedCommand) {
        divider();
        info('Suggested: ' + result.suggestedCommand);
    }

    _preloadTestKeys(result, c);

    if (
        result.confidence === 'low' ||
        (result.impactedTests.length > 0 && result.impactedTests.every((t) => t.matchMode === 'keyword'))
    ) {
        divider();
        info(
            'Dica: poucos mappings explícitos encontrados. Use a opção 21 (Gap Analysis) para identificar issues sem cobertura.',
        );
    }

    _showFlakyWarning(result);
    c.pushHistory('test-impact', `${result.impactedTests.length} tests (${result.confidence})`, 'ok');
}

export default { handler };
