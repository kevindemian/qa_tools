/**
 * mutation-scope.ts — Computa o escopo de mutação por diff para o Stryker.
 *
 * Substitui o diff-scoping que o `tautest` fazia internamente (Rota B —
 * execução direta do Stryker, ver dev/docs/internal/MUTATION-TESTING-PERF.md).
 *
 * Roda `git diff --unified=0 --no-color <base> -- <dirs-de-produção>`, extrai
 * as linhas adicionadas por arquivo-fonte (não teste/binário/excluído) e emite
 * os padrões de `mutate` do Stryker com ranges de linha (`path:inicio-fim`,
 * coalescidos).
 *
 * Uso: npx tsx scripts/mutation-scope.ts --base <git-ref>
 *   --base : ref de diff (base.sha do PR ou HEAD~1 no push)
 *
 * Saída: padrões separados por vírgula (formato `--mutate` do Stryker).
 * Exit code 2: nenhum arquivo-fonte de produção alterado com linhas adicionadas
 * (o CI pula o job). Outros exits ≠ 0: falha real.
 */

import { execFileSync } from 'node:child_process';

const GIT_DIFF_MAX_BUFFER = 50 * 1024 * 1024;
const GIT_BIN = process.env['GIT_BIN'] || '/usr/bin/git';
const MUTATE_DIRS = ['shared/', 'jira_management/', 'git_triggers/'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
const GIT_HEADER_PATTERN = /^diff --git a\/(.+?) b\/(.+)$/;
const CONFIG_FILE_PATTERN = /\.config\.[cm]?[jt]s$/;
const TEST_FILE_SUFFIX_PATTERN = /\.(?:test|spec)\.[cm]?[tj]sx?$/;

export interface Range {
    start: number;
    end: number;
}

export interface DiffFile {
    path: string;
    oldPath: string;
    status: string;
    ranges: Range[];
    lineSet: Set<number>;
    isSource: boolean;
    isTest: boolean;
    isBinary: boolean;
}

function toPosix(value: string): string {
    return value.replace(/\\/g, '/');
}

export function isTestFile(filePath: string): boolean {
    const normalized = toPosix(filePath);
    const hasTestDirectory = normalized
        .split('/')
        .some((segment) => segment === '__tests__' || segment === 'test' || segment === 'tests');
    return hasTestDirectory || TEST_FILE_SUFFIX_PATTERN.test(normalized);
}

export function isSourceFile(filePath: string): boolean {
    const normalized = toPosix(filePath);
    const ext = normalized.slice(normalized.lastIndexOf('.'));
    return (
        SOURCE_EXTENSIONS.includes(ext) &&
        !isTestFile(normalized) &&
        !normalized.endsWith('.d.ts') &&
        !CONFIG_FILE_PATTERN.test(normalized)
    );
}

function normalizePatchPath(rawPath: string): string | undefined {
    const trimmed = rawPath.trim();
    if (trimmed === '/dev/null') {
        return undefined;
    }
    return toPosix(trimmed.replace(/^[ab]\//, ''));
}

export function normalizeRange(range: Range): Range {
    const start = Math.max(1, Math.min(range.start, range.end));
    const end = Math.max(start, Math.max(range.start, range.end));
    return { start, end };
}

export function coalesceRanges(ranges: Range[], gap = 0): Range[] {
    const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
    const coalesced: Range[] = [];
    for (const range of sorted) {
        const normalized = normalizeRange(range);
        const last = coalesced[coalesced.length - 1];
        if (last && normalized.start <= last.end + gap + 1) {
            last.end = Math.max(last.end, normalized.end);
        } else {
            coalesced.push({ ...normalized });
        }
    }
    return coalesced;
}

export function compactLines(lines: Set<number>): Range[] {
    const sorted = [...lines].sort((a, b) => a - b);
    const ranges: Range[] = [];
    for (const line of sorted) {
        const last = ranges[ranges.length - 1];
        if (last && line === last.end + 1) {
            last.end = line;
        } else {
            ranges.push({ start: line, end: line });
        }
    }
    return ranges;
}

function createFileEntry(filePath: string, oldPath: string): DiffFile {
    return {
        path: filePath,
        oldPath,
        status: 'modified',
        ranges: [],
        lineSet: new Set(),
        isSource: isSourceFile(filePath),
        isTest: isTestFile(filePath),
        isBinary: false,
    };
}

function adoptPath(file: DiffFile, path: string | undefined): void {
    if (!path) {
        return;
    }
    file.path = path;
    file.isTest = isTestFile(path);
    file.isSource = isSourceFile(path);
}

function createFromDiffHeader(line: string): DiffFile {
    const match = GIT_HEADER_PATTERN.exec(line);
    const filePath = toPosix(match?.[2] ?? '');
    const oldPath = toPosix(match?.[1] ?? filePath);
    return createFileEntry(filePath, oldPath);
}

export function parseHunkHeader(line: string): number | undefined {
    const newFilePart = line.slice(2).trim().split(/\s+/)[1];
    if (!newFilePart || !newFilePart.startsWith('+')) {
        return undefined;
    }
    const newStart = Number(newFilePart.slice(1).split(',')[0]);
    return Number.isFinite(newStart) && newStart >= 0 ? newStart : undefined;
}

function applyHeaderLine(file: DiffFile, line: string): boolean {
    if (line.startsWith('new file mode ')) {
        file.status = 'added';
        return true;
    }
    if (line.startsWith('deleted file mode ')) {
        file.status = 'deleted';
        return true;
    }
    if (line.startsWith('similarity index ') || line.startsWith('rename from ') || line.startsWith('rename to ')) {
        file.status = file.status === 'deleted' ? 'deleted' : 'renamed';
        if (line.startsWith('rename from ')) {
            file.oldPath = normalizePatchPath(line.slice('rename from '.length)) ?? file.oldPath;
        } else if (line.startsWith('rename to ')) {
            adoptPath(file, normalizePatchPath(line.slice('rename to '.length)));
        }
        return true;
    }
    if (line.startsWith('Binary files ')) {
        file.status = 'binary';
        file.isBinary = true;
        return true;
    }
    if (line.startsWith('+++ ')) {
        adoptPath(file, normalizePatchPath(line.slice(4)));
        return true;
    }
    if (line.startsWith('--- ')) {
        file.oldPath = normalizePatchPath(line.slice(4)) ?? file.oldPath;
        return true;
    }
    return false;
}

function applyContentLine(
    file: DiffFile,
    line: string,
    inHunk: boolean,
    currentNewLine: number,
): { handled: boolean; currentNewLine: number } {
    if (!inHunk || file.status === 'deleted' || file.status === 'binary') {
        return { handled: true, currentNewLine };
    }
    if (line.startsWith('+')) {
        file.lineSet.add(currentNewLine);
        return { handled: true, currentNewLine: currentNewLine + 1 };
    }
    if (line.startsWith('-')) {
        return { handled: true, currentNewLine };
    }
    if (line.startsWith(' ')) {
        return { handled: true, currentNewLine: currentNewLine + 1 };
    }
    return { handled: false, currentNewLine };
}

export function parseGitDiff(diff: string): Array<Omit<DiffFile, 'lineSet'>> {
    const files: DiffFile[] = [];
    let current: DiffFile | undefined;
    let inHunk = false;
    let currentNewLine = 0;
    for (const line of diff.split(/\r?\n/)) {
        if (line.startsWith('diff --git ')) {
            current = createFromDiffHeader(line);
            files.push(current);
            inHunk = false;
            continue;
        }
        if (!current) {
            continue;
        }
        if (applyHeaderLine(current, line)) {
            continue;
        }
        if (line.startsWith('@@')) {
            const newStart = parseHunkHeader(line);
            inHunk = newStart !== undefined;
            currentNewLine = newStart ?? 0;
            continue;
        }
        const content = applyContentLine(current, line, inHunk, currentNewLine);
        if (content.handled) {
            currentNewLine = content.currentNewLine;
        }
    }
    return files.map(({ lineSet, ...file }) => ({
        ...file,
        ranges: compactLines(lineSet),
    }));
}

export function buildMutatePatterns(diff: string): string[] {
    return parseGitDiff(diff)
        .filter((file) => file.isSource && !file.isTest && !file.isBinary && file.status !== 'deleted')
        .flatMap((file) => coalesceRanges(file.ranges, 0).map((range) => `${file.path}:${range.start}-${range.end}`));
}

function readGitDiff(baseRef: string): string {
    const args = ['diff', '--unified=0', '--no-color', baseRef, '--', ...MUTATE_DIRS];
    try {
        return execFileSync(GIT_BIN, args, {
            encoding: 'utf8',
            maxBuffer: GIT_DIFF_MAX_BUFFER,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/ENOENT/.test(message)) {
            throw new Error('git executable not found. Ensure git is installed and available in PATH.', {
                cause: error,
            });
        }
        if (/maxBuffer/i.test(message)) {
            throw new Error(`git diff output exceeded the ${GIT_DIFF_MAX_BUFFER / (1024 * 1024)}MB buffer limit.`, {
                cause: error,
            });
        }
        throw new Error(`git diff failed: ${message}`, { cause: error });
    }
}

function parseArgs(argv: string[]): string {
    const baseIndex = argv.indexOf('--base');
    const baseRef = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
    if (!baseRef) {
        throw new Error('Missing required --base <git-ref>');
    }
    return baseRef;
}

function main(): void {
    const baseRef = parseArgs(process.argv.slice(2));
    const patterns = buildMutatePatterns(readGitDiff(baseRef));
    if (patterns.length === 0) {
        process.exit(2);
    }
    process.stdout.write(`${patterns.join(',')}\n`);
}

const isMainImport = process.argv[1]?.replace(/\\/g, '/').endsWith('/mutation-scope.ts');
if (isMainImport) {
    main();
}
