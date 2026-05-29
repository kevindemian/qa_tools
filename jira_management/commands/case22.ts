/** Test impact analysis — three-tier impact from git diff, with flaky footnote and cross-feature hints. */
import { execSync } from 'child_process';
import fs from 'fs';
import { ask, info, warn, title, divider, tableView, printError } from '../../shared/prompt';
import { analyzeTestImpact } from '../../shared/test-impact';
import { loadMetrics, calculateFlakiness } from '../../shared/metrics';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const range = (await ask('Git range (default: HEAD~1):')) || 'HEAD~1';

    let diff: string;
    try {
        diff = execSync(`git diff --name-only ${range}`, {
            encoding: 'utf8',
        })
            .toString()
            .trim();
    } catch (err: unknown) {
        printError('Falha ao obter git diff', err);
        return false;
    }

    if (!diff) {
        info('Nenhuma alteração encontrada.');
        return false;
    }

    const mappingPath = 'config/test-mapping.json';
    const resolvedMappingPath = fs.existsSync(mappingPath) ? mappingPath : undefined;

    const result = analyzeTestImpact(diff, {
        mappingPath: resolvedMappingPath,
    });

    title('TEST IMPACT ANALYSIS');
    tableView(
        [
            { name: 'Changed', value: result.changedFiles.join(', ') },
            {
                name: 'Impactados',
                value: `${result.impactedTests.length} tests (de ${result.unaffected.total})`,
            },
            { name: 'Confiança', value: result.confidence },
        ],
        ['name', 'value'],
    );

    if (result.impactedTests.length > 0) {
        divider();
        const modeLabel: Record<string, string> = {
            mapping: 'mapping mode',
            keyword: 'keyword mode',
            jest_find_related: 'high',
        };
        const rows = result.impactedTests.map((t) => ({
            Key: t.testKey ?? '-',
            Title: t.title,
            Mode: modeLabel[t.matchMode] ?? t.matchMode,
        }));
        tableView(rows, ['Key', 'Title', 'Mode']);
    }

    if (result.suggestedCommand) {
        divider();
        info('Suggested: ' + result.suggestedCommand);
    }

    const impactedTestKeys = result.impactedTests.map((t) => t.testKey).filter(Boolean) as string[];
    if (impactedTestKeys.length > 0) {
        c.ctx.inMemoryTasksId.push(...impactedTestKeys);
        divider();
        info(impactedTestKeys.length + ' test(s) pré-carregado(s) para criar Test Execution (opção 13).');
    }

    if (
        result.confidence === 'low' ||
        (result.impactedTests.length > 0 && result.impactedTests.every((t) => t.matchMode === 'keyword'))
    ) {
        divider();
        info(
            'Dica: poucos mappings explícitos encontrados. Use a opção 21 (Gap Analysis) para identificar issues sem cobertura.',
        );
    }

    const store = loadMetrics();
    const flakyTests = calculateFlakiness(store, 2);
    const impactedTileSet = new Set(result.impactedTests.map((t) => t.title));
    const flakyHits = flakyTests.filter((f) => impactedTileSet.has(f.title));
    if (flakyHits.length > 0) {
        divider();
        warn(flakyHits.length + ' teste(s) impactado(s) têm histórico flaky — revisar resultados manualmente.');
    }

    c.pushHistory('test-impact', `${result.impactedTests.length} tests (${result.confidence})`, 'ok');
}

export default { handler };
