'use strict';

// Catraca (turnstile) local: obriga tratamento de neverthrow.Result.
// Substitui eslint-plugin-neverthrow (abandonado; usava context.parserServices,
// removido no ESLint 10). Acesso à type info via context.sourceCode.parserServices.
// Design de propriedade do QA Tools — mecanismo de segurança, não enfraquecer.

const resultProperties = ['mapErr', 'map', 'andThen', 'orElse', 'match', 'unwrapOr'];
const handledMethods = ['match', 'unwrapOr', '_unsafeUnwrap'];

function getParts(type) {
    if (type && Array.isArray(type.types)) return type.types;
    return [type];
}

function unionResultLike(checker, parserServices, node) {
    if (!node) return false;
    const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
    if (!tsNode) return false;
    const type = checker.getTypeAtLocation(tsNode);
    const apparent = checker.getApparentType(type);
    return getParts(apparent).every((ty) =>
        resultProperties.every((p) => ty.getProperty && ty.getProperty(p) !== undefined),
    );
}

function findMemberName(node) {
    if (!node) return null;
    if (node.property && node.property.type === 'Identifier') return node.property.name;
    return null;
}

function isMemberCalledFn(node) {
    const parent = node && node.parent;
    return !!parent && parent.type === 'CallExpression' && parent.callee === node;
}

function isHandledResult(node) {
    const memberExpression = node.parent;
    if (memberExpression && memberExpression.type === 'MemberExpression') {
        const methodName = findMemberName(memberExpression);
        const methodIsCalled = isMemberCalledFn(memberExpression);
        if (methodName && handledMethods.includes(methodName) && methodIsCalled) {
            return true;
        }
        const parent = node.parent && node.parent.parent;
        if (parent && parent.type !== 'ExpressionStatement') {
            return isHandledResult(parent);
        }
    }
    return false;
}

const endTransverse = ['BlockStatement', 'Program'];

function getAssignation(checker, parserServices, node) {
    if (
        node.type === 'VariableDeclarator' &&
        unionResultLike(checker, parserServices, node.init) &&
        node.id.type === 'Identifier'
    ) {
        return node.id;
    }
    if (endTransverse.includes(node.type) || !node.parent) {
        return undefined;
    }
    return getAssignation(checker, parserServices, node.parent);
}

function isReturned(node) {
    if (node.type === 'ArrowFunctionExpression') return true;
    if (node.type === 'ReturnStatement') return true;
    if (node.type === 'BlockStatement') return false;
    if (node.type === 'Program') return false;
    if (!node.parent) return false;
    return isReturned(node.parent);
}

const ignoreParents = ['ClassDeclaration', 'FunctionDeclaration', 'MethodDefinition', 'ClassProperty'];

function processSelector(context, sourceCode, checker, parserServices, node, reportAs) {
    reportAs = reportAs || node;
    const parent = node.parent;
    if (parent && parent.type && parent.type.startsWith('TS')) {
        return false;
    }
    if (parent && ignoreParents.includes(parent.type)) {
        return false;
    }
    if (!unionResultLike(checker, parserServices, node)) {
        return false;
    }
    if (isHandledResult(node)) {
        return false;
    }
    if (isReturned(node)) {
        return false;
    }
    const assignedTo = getAssignation(checker, parserServices, node);
    const currentScope = sourceCode.getScope(assignedTo || node);
    if (assignedTo) {
        const variable = currentScope.set.get(assignedTo.name);
        const references = (variable && variable.references.filter((ref) => ref.identifier !== assignedTo)) || [];
        if (references.length > 0) {
            return references.some((ref) =>
                processSelector(context, sourceCode, checker, parserServices, ref.identifier, reportAs),
            );
        }
    }
    context.report({
        node: reportAs,
        messageId: 'mustUseResult',
    });
    return true;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    rules: {
        'must-use-result': {
            meta: {
                type: 'problem',
                docs: {
                    description: 'Result (neverthrow) deve ser tratado com match/unwrapOr/andThen/map/mapErr/orElse.',
                    recommended: 'error',
                },
                messages: {
                    mustUseResult:
                        'Result deve ser tratado (match, unwrapOr, andThen, map, mapErr ou orElse). Erros silenciosos são proibidos.',
                },
                schema: [],
            },
            create(context) {
                const sourceCode = context.sourceCode;
                const parserServices = sourceCode.parserServices;
                if (!parserServices || !parserServices.program) {
                    throw new Error(
                        'result-catraca: parserServices indisponível. Verifique languageOptions.parserOptions.project.',
                    );
                }
                const checker = parserServices.program.getTypeChecker();
                return {
                    ':matches(CallExpression, NewExpression)': (node) =>
                        processSelector(context, sourceCode, checker, parserServices, node),
                };
            },
        },
    },
};
