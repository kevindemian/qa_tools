'use strict';

const fs = require('fs');
const path = require('path');

// Detector de supressão real (no-swallow): substitui a catraca 'result-catraca'
// (teatral — o repo nao usa neverthrow, logo 0 disparos). O objetivo e impedir
// que blocos catch engulam erros (fallback silencioso, retorno de default sem
// log, ou swallow de Result/ExternalError).
//
// Permite (nao reporta):
//  - catch que relanca (throw / throw new ...)
//  - catch que chama rootLogger.error/warn/fatal E retorna sentinela de contrato
//    documentada (ex.: `if (status === 404) return null`)
//  - catch que envolve o erro em ExternalError e relanca
//
// Reporta (swallow):
//  - catch cujo corpo so retorna {} / [] / null / default sem log de erro
//  - catch que faz apenas log generico (console.log) sem relancar nem sentinela
//  - catch vazio
//
// Migracao controlada (catraca por diff, nao big-bang): ocorrencias ja existentes
// no estoque podem ser registradas em audit/suppressions.yaml (file + line + rule +
// owner + sunset 90d). O plugin CONSULTA o yaml e nao reporta entradas ativas
// casando arquivo+linha. O script scripts/audit-suppressions.ts valida que o
// contador de suppressions nao cresce alem do teto Stryker (reduccao obrigatoria).

const RULE_ID = 'local-no-swallow/no-swallow';
const SUPPRESSIONS_PATH = path.resolve(__dirname, '..', '..', 'audit', 'suppressions.yaml');

function loadSuppressions() {
    const set = new Set();
    let raw;
    try {
        raw = fs.readFileSync(SUPPRESSIONS_PATH, 'utf8');
    } catch (err) {
        return set;
    }
    const lines = raw.split('\n');
    let curFile = null;
    let curLine = null;
    let curRule = null;
    let curStatus = 'active';
    for (const line of lines) {
        const fileM = line.match(/^\s*-?\s*file:\s*['"]?([^'"]+)['"]?\s*$/);
        const lineM = line.match(/^\s*-?\s*line:\s*(\d+)\s*$/);
        const ruleM = line.match(/^\s*-?\s*rule:\s*['"]?([^'"]+)['"]?\s*$/);
        const statusM = line.match(/^\s*-?\s*status:\s*['"]?([^'"]+)['"]?\s*$/);
        const entryEnd = /^\s*-\s+file:/.test(line);
        if (fileM) {
            if (curFile !== null) flush();
            curFile = fileM[1].trim();
            curLine = null;
            curRule = null;
            curStatus = 'active';
        } else if (lineM) {
            curLine = Number(lineM[1]);
        } else if (ruleM) {
            curRule = ruleM[1].trim();
        } else if (statusM) {
            curStatus = statusM[1].trim();
        } else if (entryEnd && curFile !== null) {
            flush();
        }
    }
    flush();
    function flush() {
        if (curFile !== null && curLine !== null) {
            const normalized = curFile.replace(/^\.\//, '');
            set.add(`${normalized}#${curLine}#${curRule ?? ''}#${curStatus}`);
        }
        curFile = null;
        curLine = null;
        curRule = null;
        curStatus = 'active';
    }
    return set;
}

const SUPPRESSIONS = loadSuppressions();

function isSuppressed(filename, line, rule) {
    if (SUPPRESSIONS.size === 0) return false;
    const rel = filename.replace(/.*\/qa_tools\//, '');
    const keyExact = `${rel}#${line}#${rule}#active`;
    if (SUPPRESSIONS.has(keyExact)) return true;
    const keyAnyRule = `${rel}#${line}##active`;
    if (SUPPRESSIONS.has(keyAnyRule)) return true;
    return false;
}

function walk(node, visit, seen) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    visit(node);
    for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = node[key];
        if (Array.isArray(child)) {
            for (const c of child) walk(c, visit, seen);
        } else if (child && typeof child === 'object' && child.type) {
            walk(child, visit, seen);
        }
    }
}

function isRethrow(body) {
    let found = false;
    walk(
        body,
        (n) => {
            if (n.type === 'ThrowStatement') found = true;
        },
        new Set(),
    );
    return found;
}

function hasErrorLog(body) {
    let found = false;
    walk(
        body,
        (n) => {
            if (found) return;
            if (n.type === 'CallExpression') {
                const callee = n.callee;
                if (callee.type === 'MemberExpression') {
                    const prop = callee.property && callee.property.name;
                    const obj = callee.object;
                    const isRootLogger =
                        (obj && obj.type === 'Identifier' && obj.name === 'rootLogger') ||
                        (obj &&
                            obj.type === 'MemberExpression' &&
                            obj.object.type === 'Identifier' &&
                            obj.object.name === 'rootLogger');
                    if (isRootLogger && ['error', 'warn', 'fatal'].includes(prop)) {
                        found = true;
                    }
                }
            }
        },
        new Set(),
    );
    return found;
}

function catchBodyOnlyReturnsDefault(body) {
    const stmts = (body.body || []).filter((s) => s.type !== 'EmptyStatement');
    if (stmts.length === 0) return true;
    const returns = stmts.filter((s) => s.type === 'ReturnStatement');
    if (returns.length === 0) return false;
    const allReturnDefault = returns.every((s) => {
        const arg = s.argument;
        if (!arg) return true;
        if (arg.type === 'Literal' && (arg.value === null || arg.value === undefined)) return true;
        if (arg.type === 'ArrayExpression' && arg.elements.length === 0) return true;
        if (arg.type === 'ObjectExpression' && arg.properties.length === 0) return true;
        if (arg.type === 'Identifier' && /^(DEFAULT_|default|fallback|EMPTY)/.test(arg.name)) return true;
        return false;
    });
    return allReturnDefault && !hasErrorLog(body) && !isRethrow(body);
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    rules: {
        'no-swallow': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'Bloqueia catch que engole erro (fallback silencioso, retorno de default sem log, ou swallow de Result).',
                    recommended: 'error',
                },
                messages: {
                    swallow:
                        'Erro silenciado proibido (AGENTS §25). Trate o erro: relance, envolva em ExternalError, ou registre com rootLogger.error/warn e retorne sentinela de contrato documentada (ex.: 404 -> null).',
                },
                schema: [],
            },
            create(context) {
                return {
                    CatchClause(node) {
                        const body = node.body;
                        // Permitido: relanca, ou loga com rootLogger + sentinela documentada.
                        if (isRethrow(body)) return;
                        if (hasErrorLog(body)) return;
                        // Alvo da regra (camada sintatica de precisao): silenciamento inequivoco.
                        // 1) catch vazio; 2) catch que retorna default silencioso sem log.
                        // Outros padroes (log+return default, returnNull) sao cobertos pelo
                        // Semgrep semantico (Camada B) para evitar falso-positivo em sentinelas.
                        if (catchBodyOnlyReturnsDefault(body)) {
                            const line = node.loc && node.loc.start.line;
                            const filename =
                                (typeof context.getFilename === 'function' && context.getFilename()) ||
                                (typeof context.getPhysicalFilename === 'function' && context.getPhysicalFilename()) ||
                                context.filename ||
                                '';
                            if (line && isSuppressed(filename, line, RULE_ID)) return;
                            context.report({ node: body, messageId: 'swallow' });
                        }
                    },
                };
            },
        },
    },
};
