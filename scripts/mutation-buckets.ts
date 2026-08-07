/**
 * mutation-buckets.ts — Registro canônico de buckets de mutation testing (Estratégia B).
 *
 * Fonte única de verdade do particionamento de diretórios. Novos diretórios de
 * produção DEVEM ser registrados aqui (não no CI). A validação de cobertura
 * (`validateBucketCoverage`) garante que a união dos buckets cobre exatamente
 * todos os arquivos-fonte sob MUTATE_DIRS — um gap (diretório novo esquecido)
 * ou overlap (arquivo em 2 buckets → mutado 2x, score duplicado) é defeito e
 * falha em CI (Rule 25: expansão nunca silenciosa).
 *
 * Regras de spec:
 * - `<dir>`           — o diretório e tudo sob ele (recursivo)
 * - `<dir>/root`      — apenas arquivos diretamente dentro de `<dir>` (top-level)
 *
 * Uso:
 *   npx tsx scripts/mutation-buckets.ts --list                → lista buckets (formato `nome=spec1,spec2`)
 *   npx tsx scripts/mutation-buckets.ts --json                → matriz de buckets como JSON (para `fromJSON` no CI)
 *   npx tsx scripts/mutation-buckets.ts --validate <arquivos> → exit 2 se houver gap/overlap
 */

import { buildDirFilter, isSourceFile } from './mutation-scope.js';

const MUTATE_DIRS = ['shared/', 'jira_management/', 'git_triggers/'];

export interface BucketDefinition {
    name: string;
    specs: string[];
}

/**
 * Partição canônica. Ao adicionar um diretório: mova-o de um bucket existente
 * para outro, ou crie um bucket novo — nunca deixe um diretório de produção
 * fora desta lista (a validação falha se isso acontecer).
 */
export const MUTATION_BUCKETS: BucketDefinition[] = [
    { name: 'data-hub', specs: ['shared/data-hub'] },
    { name: 'report', specs: ['shared/report'] },
    { name: 'quality', specs: ['shared/quality'] },
    { name: 'insights', specs: ['shared/insights'] },
    { name: 'validation', specs: ['shared/validation'] },
    { name: 'ui-primitives', specs: ['shared/ui', 'shared/primitives'] },
    { name: 'llm-test-utils-invariants', specs: ['shared/llm', 'shared/test-utils', 'shared/invariants'] },
    {
        name: 'ci-infra-types-misc',
        specs: [
            'shared/ci',
            'shared/infra',
            'shared/types',
            'shared/constants',
            'shared/jira',
            'shared/prompts',
            'shared/migration',
            'shared/__mocks__',
        ],
    },
    { name: 'shared-root', specs: ['shared/root'] },
    {
        name: 'jira-management',
        specs: ['jira_management/root', 'jira_management/commands', 'jira_management/__mocks__'],
    },
    { name: 'git-triggers', specs: ['git_triggers/root'] },
];

export function listBucketNames(): string[] {
    return MUTATION_BUCKETS.map((bucket) => bucket.name);
}

/**
 * Valida que a partição de buckets cobre exatamente todos os arquivos-fonte
 * sob MUTATE_DIRS (Rule 25). Retorna true se válida; lança Error com a lista
 * de arquivos com gap/overlap se inválida.
 *
 * `buckets` é injetável para testabilidade hermética (o default é a partição
 * canônica MUTATION_BUCKETS — nunca passe partições ad-hoc em produção).
 */
function buildFailureMessage(uncovered: string[], overlaps: Array<{ path: string; buckets: string[] }>): string {
    const lines: string[] = ['Bucket coverage validation FAILED (Rule 25 — silent scope gap is a defect):'];
    if (uncovered.length > 0) {
        lines.push(`  Uncovered source files (no bucket matches): ${uncovered.length}`);
        for (const path of uncovered.slice(0, 20)) {
            lines.push(`    - ${path}`);
        }
        if (uncovered.length > 20) {
            lines.push(`    ... and ${uncovered.length - 20} more`);
        }
    }
    if (overlaps.length > 0) {
        lines.push(`  Overlaps (file matched multiple buckets → would be mutated twice): ${overlaps.length}`);
        for (const overlap of overlaps.slice(0, 20)) {
            lines.push(`    - ${overlap.path} → ${overlap.buckets.join(', ')}`);
        }
        if (overlaps.length > 20) {
            lines.push(`    ... and ${overlaps.length - 20} more`);
        }
    }
    return lines.join('\n');
}

export function validateBucketCoverage(allFiles: string[], buckets: BucketDefinition[] = MUTATION_BUCKETS): boolean {
    const sourceFiles = allFiles.filter(
        (path) => isSourceFile(path) && MUTATE_DIRS.some((dir) => path.startsWith(dir)),
    );
    const predicates = new Map(buckets.map((bucket) => [bucket.name, buildDirFilter(bucket.specs)] as const));
    const uncovered: string[] = [];
    const overlaps: Array<{ path: string; buckets: string[] }> = [];

    for (const file of sourceFiles) {
        const matched = buckets
            .filter((bucket) => predicates.get(bucket.name)?.(file) === true)
            .map((bucket) => bucket.name);
        if (matched.length === 0) {
            uncovered.push(file);
        } else if (matched.length > 1) {
            overlaps.push({ path: file, buckets: matched });
        }
    }

    if (uncovered.length > 0 || overlaps.length > 0) {
        throw new Error(buildFailureMessage(uncovered, overlaps));
    }
    return true;
}

function parseArgs(argv: string[]): { mode: 'validate' | 'list' | 'json'; files: string[] } {
    const first = argv[0];
    let mode: 'validate' | 'list' | 'json' | undefined;
    if (first === '--validate') {
        mode = 'validate';
    } else if (first === '--list') {
        mode = 'list';
    } else if (first === '--json') {
        mode = 'json';
    }
    if (!mode) {
        throw new Error('Usage: mutation-buckets.ts --list | --json | --validate <tracked-files...>');
    }
    return { mode, files: argv.slice(1) };
}

function main(): void {
    const { mode, files } = parseArgs(process.argv.slice(2));
    if (mode === 'list') {
        for (const bucket of MUTATION_BUCKETS) {
            process.stdout.write(`${bucket.name}=${bucket.specs.join(',')}\n`);
        }
        return;
    }
    if (mode === 'json') {
        const matrix = MUTATION_BUCKETS.map((bucket) => ({
            name: bucket.name,
            specs: bucket.specs.join(','),
        }));
        process.stdout.write(`${JSON.stringify(matrix)}\n`);
        return;
    }
    if (files.length === 0) {
        throw new Error('--validate requires the list of tracked files as arguments (xargs from git ls-files).');
    }
    if (validateBucketCoverage(files)) {
        process.stdout.write('Bucket coverage validation PASSED.\n');
    }
}

const isMainImport = process.argv[1]?.replace(/\\/g, '/').endsWith('/mutation-buckets.ts');
if (isMainImport) {
    main();
}
