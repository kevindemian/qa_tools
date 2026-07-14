import ts from 'typescript';
import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSContext, type QuickJSHandle } from 'quickjs-emscripten';
import { rootLogger } from '../shared/logger.js';
import { getErrorMessage } from '../shared/errors.js';

/** Hard timeout for a single config evaluation. Prevents a malicious or
 * pathological config from hanging the setup process. */
export const ISOLATE_TIMEOUT_MS = 500;

/** Framework config helpers stubbed as identity (`defineConfig(x) => x`).
 * Any other `require(...)` resolves to an empty object, so unknown imports
 * cannot reintroduce host behavior. */
const STUB_MODULE_NAMES = new Set(['vitest/config', 'vite', 'vitest', '@playwright/test', 'jest', 'cypress']);

type QuickJSModule = Awaited<ReturnType<typeof getQuickJS>>;

let modulePromise: Promise<QuickJSModule> | null = null;
function getModule(): Promise<QuickJSModule> {
    if (modulePromise === null) {
        modulePromise = getQuickJS();
    }
    return modulePromise;
}

/** Code injected into the isolate after the config is evaluated. It reads the
 * resolved config (CommonJS `module.exports`, honoring ESM `default`) and walks
 * the `reporters` / `reporter` / `test.reporters` fields, returning a JSON
 * array of raw reporter identifiers. No host access — pure data extraction. */
const EXTRACTION_CODE = [
    '(function () {',
    '  var cfg = (typeof module !== "undefined" && module.exports) ? module.exports',
    '    : (typeof exports !== "undefined" ? exports : undefined);',
    '  if (!cfg) return "[]";',
    '  var root = (cfg.default && typeof cfg.default === "object") ? cfg.default : cfg;',
    '  if (!root || typeof root !== "object") return "[]";',
    '  var out = [];',
    '  function push(r) {',
    '    if (r == null) return;',
    '    if (!Array.isArray(r)) r = [r];',
    '    for (var i = 0; i < r.length; i++) {',
    '      var it = r[i];',
    "      if (typeof it === 'string') out.push(it);",
    "      else if (Array.isArray(it)) { if (typeof it[0] === 'string') out.push(it[0]); }",
    "      else if (it && typeof it === 'object') {",
    '        var c = (it.constructor && it.constructor.name) || "";',
    '        if (c) out.push(c);',
    '      }',
    '    }',
    '  }',
    '  push(root.test && root.test.reporters);',
    '  push(root.reporters);',
    '  push(root.reporter);',
    '  return JSON.stringify(out);',
    '})()',
].join('\n');

/**
 * Execute a test config in a QuickJS WebAssembly isolate and return the raw
 * reporter identifiers found in it.
 *
 * Security model (non-negotiable):
 * - The isolate has ZERO host bindings: no `fs`, `child_process`, `fetch`,
 *   real `process`, or module loader. The only globals we provide are
 *   `module`/`exports`, a `require` that returns identity stubs for known
 *   framework helpers (and empty objects otherwise), a frozen `process.env`,
 *   and a no-op `console`.
 * - Only serializable data crosses the boundary: the config evaluates, we
 *   extract `reporters` as a JSON string, and the host parses it.
 *
 * Throws on any evaluation failure (timeout, syntax error, unsupported
 * construct). The caller is responsible for falling back to the AST extractor.
 */
export async function executeConfigInIsolate(configPath: string, source: string): Promise<string[]> {
    const QuickJS = await getModule();
    const runtime = QuickJS.newRuntime();
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + ISOLATE_TIMEOUT_MS));
    const vm: QuickJSContext = runtime.newContext();

    try {
        const moduleHandle = vm.newObject();
        const exportsHandle = vm.newObject();
        vm.setProp(moduleHandle, 'exports', exportsHandle);
        vm.setProp(vm.global, 'module', moduleHandle);
        vm.setProp(vm.global, 'exports', exportsHandle);

        const requireFn = vm.newFunction('require', (nameHandle: QuickJSHandle) => {
            const name = vm.getString(nameHandle);
            const obj = vm.newObject();
            if (STUB_MODULE_NAMES.has(name)) {
                const identity = vm.newFunction('stub', (...args: QuickJSHandle[]) => {
                    if (args.length > 0 && args[0] !== undefined) return args[0];
                    return vm.newObject();
                });
                vm.setProp(obj, 'defineConfig', identity);
                vm.setProp(obj, 'default', identity);
                identity.dispose();
            }
            return obj;
        });
        vm.setProp(vm.global, 'require', requireFn);
        requireFn.dispose();
        exportsHandle.dispose();
        moduleHandle.dispose();

        const processHandle = vm.newObject();
        const envHandle = vm.newObject();
        vm.setProp(processHandle, 'env', envHandle);
        vm.setProp(vm.global, 'process', processHandle);
        envHandle.dispose();
        processHandle.dispose();

        const consoleHandle = vm.newObject();
        const noop = vm.newFunction('noop', () => undefined);
        vm.setProp(consoleHandle, 'log', noop);
        vm.setProp(consoleHandle, 'error', noop);
        vm.setProp(consoleHandle, 'warn', noop);
        vm.setProp(vm.global, 'console', consoleHandle);
        noop.dispose();
        consoleHandle.dispose();

        const js = transpileToCommonJs(configPath, source);
        const evalResult = vm.evalCode(js, configPath);
        let completion: QuickJSHandle;
        try {
            completion = vm.unwrapResult(evalResult);
        } catch (err) {
            throw new Error('config evaluation failed: ' + getErrorMessage(err), { cause: err });
        }
        completion.dispose();

        const extracted = vm.evalCode(EXTRACTION_CODE);
        let jsonHandle: QuickJSHandle;
        try {
            jsonHandle = vm.unwrapResult(extracted);
        } catch (err) {
            throw new Error('reporter extraction failed: ' + getErrorMessage(err), { cause: err });
        }
        const json = vm.getString(jsonHandle);
        jsonHandle.dispose();

        const parsed: unknown = JSON.parse(json);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((x): x is string => typeof x === 'string');
    } finally {
        vm.dispose();
        runtime.dispose();
    }
}

function transpileToCommonJs(configPath: string, source: string): string {
    if (configPath.endsWith('.json')) {
        return `module.exports = (${source});`;
    }
    const result = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            allowJs: true,
            esModuleInterop: true,
        },
        fileName: configPath,
    });
    return result.outputText;
}

/** Exposed for tests: log the reason a config fell back to AST. */
export function logIsolateFallback(configPath: string, err: unknown): void {
    rootLogger.debug(`executeConfigInIsolate: falling back to AST for ${configPath}: ${getErrorMessage(err)}`);
}
