import {
    Project,
    SyntaxKind,
    type ObjectLiteralExpression,
    type ArrayLiteralExpression,
    type PropertyAssignment,
    type StringLiteral,
    type NewExpression,
    type CallExpression,
    type SourceFile,
} from 'ts-morph';
import { rootLogger } from '../shared/logger.js';
import { getErrorMessage } from '../shared/errors.js';

/**
 * AST fallback reporter extraction (ts-morph / TypeScript). This NEVER executes
 * the config — it only parses the source and walks the static `reporters` /
 * `reporter` / `test.reporters` arrays. Used when the isolate executor fails
 * (timeout, unsupported construct, or `import.meta` usage). It is an
 * unconditional structural safety net.
 */
export function extractReportersAst(configPath: string, source: string): string[] {
    try {
        if (configPath.endsWith('.json')) {
            return extractReportersFromJsonObject(parseJsonObject(source));
        }

        const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
        const ext = /\.(js|mjs|cjs)$/.test(configPath) ? '.js' : '.ts';
        const sf = project.createSourceFile('config' + ext, source, { overwrite: true });

        const importMap: Record<string, string> = {};
        for (const imp of sf.getImportDeclarations()) {
            const spec = imp.getModuleSpecifierValue();
            for (const named of imp.getNamedImports()) importMap[named.getName()] = spec;
            const def = imp.getDefaultImport();
            if (def) importMap[def.getText()] = spec;
        }

        const root = findRootConfigObject(sf);
        if (root === undefined) return [];

        const candidates: string[] = [];
        collectFromArrayProperty(root, 'reporters', importMap, candidates);
        collectFromArrayProperty(root, 'reporter', importMap, candidates);
        const repString = getStringProperty(root, 'reporter');
        if (repString !== undefined) candidates.push(repString);
        const testObj = getObjectProperty(root, 'test');
        if (testObj !== undefined) collectFromArrayProperty(testObj, 'reporters', importMap, candidates);

        return dedupe(candidates);
    } catch (err) {
        rootLogger.debug(`extractReportersAst: failed for ${configPath}: ${getErrorMessage(err)}`);
        return [];
    }
}

/** Walk a parsed JSON object (e.g. a package.json inline block or jest/vitest
 * config block) for reporters across `reporters` / `reporter` / `test.reporters`. */
export function extractReportersFromJsonObject(obj: unknown): string[] {
    const out: string[] = [];
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return out;
    const root = obj as Record<string, unknown>;
    collectJsonReporters(root['reporters'], out);
    collectJsonReporters(root['reporter'], out);
    const test = root['test'];
    if (test !== null && typeof test === 'object' && !Array.isArray(test)) {
        collectJsonReporters((test as Record<string, unknown>)['reporters'], out);
    }
    return dedupe(out);
}

function parseJsonObject(source: string): unknown {
    return JSON.parse(source) as unknown;
}

function findRootConfigObject(sf: SourceFile): ObjectLiteralExpression | undefined {
    for (const ea of sf.getDescendantsOfKind(SyntaxKind.ExportAssignment)) {
        const obj = unwrapToObject(ea.getExpression());
        if (obj !== undefined) return obj;
    }
    for (const bin of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
        if (bin.getLeft().getText() === 'module.exports') {
            const obj = unwrapToObject(bin.getRight());
            if (obj !== undefined) return obj;
        }
    }
    for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
        if (obj.getProperty('reporters') || obj.getProperty('reporter') || obj.getProperty('test')) {
            return obj;
        }
    }
    return undefined;
}

function unwrapToObject(node: import('ts-morph').Node): ObjectLiteralExpression | undefined {
    if (node.getKind() === SyntaxKind.ObjectLiteralExpression) {
        return node as ObjectLiteralExpression;
    }
    if (node.getKind() === SyntaxKind.CallExpression) {
        const call = node as CallExpression;
        const args = call.getArguments();
        const firstArg = args[0];
        if (firstArg !== undefined && firstArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
            return firstArg as ObjectLiteralExpression;
        }
    }
    return undefined;
}

function collectFromArrayProperty(
    obj: ObjectLiteralExpression,
    name: string,
    importMap: Record<string, string>,
    out: string[],
): void {
    const arr = getArrayProperty(obj, name);
    if (arr === undefined) return;
    for (const el of arr.getElements()) {
        classifyArrayElement(el, importMap, out);
    }
}

function classifyArrayElement(el: import('ts-morph').Node, importMap: Record<string, string>, out: string[]): void {
    const kind = el.getKind();
    if (kind === SyntaxKind.StringLiteral || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
        out.push((el as StringLiteral).getLiteralValue());
        return;
    }
    if (kind === SyntaxKind.ArrayLiteralExpression) {
        const inner = (el as ArrayLiteralExpression).getElements();
        const first = inner[0];
        if (first !== undefined && first.getKind() === SyntaxKind.StringLiteral) {
            out.push((first as StringLiteral).getLiteralValue());
        }
        return;
    }
    if (kind === SyntaxKind.NewExpression) {
        const ctor = (el as NewExpression).getExpression().getText();
        out.push(ctor);
        const spec = importMap[ctor];
        if (spec !== undefined) out.push(spec);
        return;
    }
    if (kind === SyntaxKind.Identifier) {
        const id = el.getText();
        const spec = importMap[id];
        out.push(spec !== undefined ? spec : id);
    }
}

function getObjectProperty(obj: ObjectLiteralExpression, name: string): ObjectLiteralExpression | undefined {
    const prop = obj.getProperty(name);
    if (prop === undefined || prop.getKind() !== SyntaxKind.PropertyAssignment) return undefined;
    const init = (prop as PropertyAssignment).getInitializer();
    if (init === undefined) return undefined;
    if (init.getKind() === SyntaxKind.ObjectLiteralExpression) return init as ObjectLiteralExpression;
    return undefined;
}

function getArrayProperty(obj: ObjectLiteralExpression, name: string): ArrayLiteralExpression | undefined {
    const prop = obj.getProperty(name);
    if (prop === undefined || prop.getKind() !== SyntaxKind.PropertyAssignment) return undefined;
    const init = (prop as PropertyAssignment).getInitializer();
    if (init === undefined) return undefined;
    if (init.getKind() === SyntaxKind.ArrayLiteralExpression) return init as ArrayLiteralExpression;
    return undefined;
}

function getStringProperty(obj: ObjectLiteralExpression, name: string): string | undefined {
    const prop = obj.getProperty(name);
    if (prop === undefined || prop.getKind() !== SyntaxKind.PropertyAssignment) return undefined;
    const init = (prop as PropertyAssignment).getInitializer();
    if (init === undefined) return undefined;
    if (init.getKind() === SyntaxKind.StringLiteral || init.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
        return (init as StringLiteral).getLiteralValue();
    }
    return undefined;
}

function collectJsonReporters(value: unknown, out: string[]): void {
    if (value == null) return;
    const arr = Array.isArray(value) ? value : [value];
    for (const it of arr) {
        if (typeof it === 'string') {
            out.push(it);
        } else if (Array.isArray(it)) {
            if (typeof it[0] === 'string') out.push(it[0]);
        } else if (it !== null && typeof it === 'object') {
            const ctor = (it as { constructor?: { name?: string } }).constructor;
            const name = ctor?.name ?? '';
            if (name) out.push(name);
        }
    }
}

function dedupe(arr: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of arr) {
        const trimmed = raw.trim();
        if (trimmed.length === 0) continue;
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
    }
    return result;
}
