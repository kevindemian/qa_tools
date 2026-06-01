import Config from '../shared/config';
import { loadTypedState } from '../shared/state';
import { NOT_CONFIGURED } from './constants';

export interface MenuItem {
    section?: string;
    id?: string;
    label?: string;
    configKey?: string;
}

export interface MenuChoice {
    type?: 'separator';
    line?: string;
    name?: string;
    value?: string;
    description?: string;
    disabled?: boolean | string;
}

export const HELP_TOPICS: Record<string, string> = {
    csv: 'Formato CSV:\n  Cada teste e um bloco separado por "---"\n  Campos obrigatórios: Title, Action/Data/Expected Result\n  Opcionais: Description, Pre-condition, Linked Issues, Group\n  Exemplo em test_steps.csv',
    labels: 'Labels Jira:\n  Separadas por virgula. Sem acentos, sem espacos.\n  Ex: qa,regression,smoke,sprint-30',
    group: 'Group: agrupa testes para cross-reference.\n  Testes com mesmo Group: tem descricoes atualizadas automaticamente\n  apos criação com referencia mutua.',
    precondition:
        'Pre-condition:\n  Referencia: "KEY-123" (issue Jira)\n  Inline: texto descritivo (aparece na descrição do teste)',
    project:
        'Projeto Jira:\n  Chave do projeto (ex: ECSPOL, PROJ).\n  Deve estar definido no Jira com permissao de criação de issues.',
    version: 'Versão:\n  Nome da versão (ex: v2.7.0).\n  Criada no projeto Jira para organizar releases.',
    transitions:
        'Transicoes:\n  Fluxo: New -> Approve -> Coding In Progress -> Coding Done -> Done\n  Use a opção 7 para fechamento automatico.',
    template: 'Template CSV/JSON:\n  Use a opção 11 (GERAÇÃO DE CASOS DE TESTE) para gerar um arquivo de exemplo.',
    diagnostics:
        'Diagnostico de conexão:\n  Opção 12 (CONFIGURAÇÃO). Testa conectividade com Jira API, Xray API,\n  e valida o projeto atual. Mostra tempos de resposta e status HTTP.',
};

export const ALIASES: Record<string, string> = {
    criar: '1',
    'criar-teste': '1',
    'criar-testes': '1',
    'listar-versoes': '2',
    versoes: '2',
    'criar-versão': '3',
    'atribuir-fixversion': '4',
    fixversion: '4',
    'atualizar-package': '5',
    package: '5',
    verificar: '6',
    status: '6',
    fechar: '7',
    publicar: '8',
    release: '8',
    'trocar-projeto': '9',
    projeto: '9',
    'trocar-diretório': '10',
    diretório: '10',
    template: '11',
    'gerar-template': '11',
    'template-csv': '11',
    'template:csv': '11',
    'template-json': '11',
    'template:json': '11',
    'gerar-template-json': '11',
    testexec: '13',
    'criar-testexec': '13',
    execução: '13',
    'diretório-cypress': '14',
    cypress: '14',
    'importar-json': '15',
    relatório: '17',
    html: '17',
    us: '18',
    estória: '18',
    história: '18',
    cobertura: '19',
    'gap-analysis': '21',
    gaps: '21',
    'test-impact': '22',
    impacto: '22',
    'ai-feedback': '23',
    feedback: '23',

    w: '24',
    setup: '24',
    wizard: '24',
    configurar: '24',
    bug: '20',
    'bug-report': '20',
    bugreport: '20',
    'criar-bug': '20',
    json: '15',
    'diretório-json': '16',
    d: 'docs',
    documentação: 'docs',
    docs: 'docs',
    sair: '0',
    exit: '0',
    voltar: '/menu',
    ajuda: '/help',
    help: '/help',
};

export function resolveAlias(choice: string): string {
    const trimmed = choice.trim().toLowerCase();
    return ALIASES[trimmed] || choice;
}

export const CATEGORIES: MenuItem[] = [
    { id: 'reports', label: 'GERAÇÃO DE RELATÓRIOS' },
    { id: 'tests', label: 'GERAÇÃO DE CASOS DE TESTE' },
    { id: 'bugreport', label: 'BUG REPORT' },
    { id: 'analytics', label: 'ANÁLISE E HISTÓRICO' },
    { id: 'releases', label: 'RELEASES' },
    { id: 'config', label: 'CONFIGURAÇÃO' },
    { id: '0', label: 'Voltar ao menu principal' },
];

export const SUB_MENUS: Record<string, MenuItem[]> = {
    reports: [
        { id: '17', label: 'Gerar relatório HTML' },
        { id: '0', label: 'Voltar' },
    ],
    tests: [
        { id: '1', label: 'Criar testes a partir de CSV' },
        { id: '13', label: 'Criar Test Execution para testes existentes' },
        { id: '15', label: 'Importar testes de JSON' },
        { id: '18', label: 'Gerar testes via User Story (IA)' },
        { id: '11', label: 'Gerar template (CSV/JSON)' },
        { id: '0', label: 'Voltar' },
    ],
    bugreport: [
        { id: '20', label: 'Criar Bug Report' },
        { id: '0', label: 'Voltar' },
    ],
    analytics: [
        { id: '19', label: 'Histórico / Cobertura' },
        { id: '21', label: 'Análise de gaps de cobertura' },
        { id: '22', label: 'Impacto de mudanças (test impact)' },
        { id: '23', label: 'Feedback de IA' },
        { id: '0', label: 'Voltar' },
    ],
    releases: [
        { id: '2', label: 'Listar versões de release' },
        { id: '3', label: 'Criar nova versão' },
        { id: '4', label: 'Atribuir fixVersion às tarefas' },
        { id: '5', label: 'Atualizar package.json + release notes' },
        { id: '6', label: 'Verificar status das tarefas' },
        { id: '7', label: 'Fechar tarefas automaticamente' },
        { id: '8', label: 'Publicar versão' },
        { id: '0', label: 'Voltar' },
    ],
    config: [
        { id: '9', label: 'Alterar projeto Jira' },
        { id: '10', label: 'Alterar diretório git', configKey: 'gitDir' },
        { id: '14', label: 'Alterar diretório Cypress', configKey: 'cypressDir' },
        { id: '16', label: 'Alterar diretório JSON', configKey: 'jsonDir' },
        { id: '12', label: 'Diagnosticar conexão' },
        { id: '24', label: 'Setup wizard / Primeiros passos' },
        { id: '0', label: 'Voltar' },
    ],
};

export const CATEGORY_IDS = new Set(Object.keys(SUB_MENUS));

export const CATEGORY_TITLES: Record<string, string> = {
    reports: 'GERAÇÃO DE RELATÓRIOS',
    tests: 'GERAÇÃO DE CASOS DE TESTE',
    bugreport: 'BUG REPORT',
    analytics: 'ANÁLISE E HISTÓRICO',
    releases: 'RELEASES',
    config: 'CONFIGURAÇÃO',
};

function _buildAliasMap(): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const [alias, id] of Object.entries(ALIASES)) {
        if (!map[id]) map[id] = [];
        map[id].push(alias);
    }
    return map;
}

export const ID_TO_ALIASES = _buildAliasMap();

export function _configHint(key: string, ctx: { git_directory: string }): string {
    if (key === 'gitDir') return '(atual: ' + ctx.git_directory + ')';
    if (key === 'cypressDir')
        return (
            '(atual: ' + (Config.get('cypressProjectPath') || loadTypedState().lastCypressPath || NOT_CONFIGURED) + ')'
        );
    if (key === 'jsonDir') return '(atual: ' + (loadTypedState().lastJsonDir || NOT_CONFIGURED) + ')';
    return '';
}

export function buildMenuChoices(level: string, proj: string, ctx: { git_directory: string }): MenuChoice[] {
    const items = level === 'main' ? CATEGORIES : SUB_MENUS[level] || CATEGORIES;
    const choices: MenuChoice[] = [];
    for (const item of items) {
        if (item.section) {
            choices.push({ type: 'separator', line: '' }, { type: 'separator', line: item.section });
        } else if (item.id === '0') {
            choices.push({ name: '      ' + item.label, value: '0' });
        } else {
            const entry: MenuChoice = { name: '      ' + item.label, value: item.id };
            if (item.configKey === 'gitDir') entry.description = ctx.git_directory;
            else if (item.configKey === 'cypressDir')
                entry.description =
                    Config.get('cypressProjectPath') || loadTypedState().lastCypressPath || NOT_CONFIGURED;
            else if (item.configKey === 'jsonDir') entry.description = loadTypedState().lastJsonDir || NOT_CONFIGURED;
            else if (item.id === '9') entry.description = proj;
            if (item.id && ID_TO_ALIASES[item.id]) {
                const a = ID_TO_ALIASES[item.id]!;
                const hint = 'alias: ' + a.slice(0, 2).join(', ') + (a.length > 2 ? '…' : '');
                entry.description = entry.description ? entry.description + ' (' + hint + ')' : hint;
            }
            choices.push(entry);
        }
    }
    return choices;
}
