import { nonNull } from '../shared/test-utils.js';
import {
    HELP_TOPICS,
    ALIASES,
    resolveAlias,
    CATEGORIES,
    SUB_MENUS,
    CATEGORY_IDS,
    CATEGORY_TITLES,
    ID_TO_ALIASES,
    _configHint,
    buildMenuChoices,
} from './menu-data.js';

describe('HELP_TOPICS', () => {
    it('contains expected topics', () => {
        expect(HELP_TOPICS).toHaveProperty('csv');
        expect(HELP_TOPICS).toHaveProperty('labels');
        expect(HELP_TOPICS).toHaveProperty('group');
        expect(HELP_TOPICS).toHaveProperty('precondition');
        expect(HELP_TOPICS).toHaveProperty('project');
        expect(HELP_TOPICS).toHaveProperty('version');
        expect(HELP_TOPICS).toHaveProperty('transitions');
        expect(HELP_TOPICS).toHaveProperty('template');
        expect(HELP_TOPICS).toHaveProperty('diagnostics');
    });

    it('each topic is a non-empty string', () => {
        for (const entry of Object.entries(HELP_TOPICS)) {
            const [, value] = entry;
            expect(value.length).toBeGreaterThan(0);
        }
    });
});

describe('ALIASES', () => {
    it('contains known command aliases', () => {
        expect(ALIASES['criar']).toBe('1');
        expect(ALIASES['sair']).toBe('0');
        expect(ALIASES['help']).toBe('/help');
        expect(ALIASES['docs']).toBe('docs');
        expect(ALIASES['template']).toBe('11');
    });

    it('every alias resolves to a string value', () => {
        for (const entry of Object.entries(ALIASES)) {
            const [alias, value] = entry;
            expect(alias.length).toBeGreaterThan(0);
            expect(typeof value).toBe('string');
        }
    });
});

describe('resolveAlias', () => {
    it('returns mapped value for known alias', () => {
        expect(resolveAlias('criar')).toBe('1');
        expect(resolveAlias('versoes')).toBe('2');
    });

    it('is case insensitive', () => {
        expect(resolveAlias('CRIAR')).toBe('1');
        expect(resolveAlias('Criar')).toBe('1');
    });

    it('returns original input for unknown alias', () => {
        expect(resolveAlias('unknown')).toBe('unknown');
        expect(resolveAlias('99')).toBe('99');
    });

    it('handles empty string', () => {
        expect(resolveAlias('')).toBe('');
    });

    it('trims whitespace', () => {
        expect(resolveAlias('  criar  ')).toBe('1');
    });
});

describe('CATEGORIES', () => {
    it('contains expected number of categories', () => {
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(7);
    });

    it('includes main category IDs', () => {
        const ids = CATEGORIES.map((c) => c.id);
        expect(ids).toContain('reports');
        expect(ids).toContain('tests');
        expect(ids).toContain('releases');
        expect(ids).toContain('config');
    });

    it('each category has id and label', () => {
        for (const cat of CATEGORIES) {
            expect(cat.id).toBeTruthy();
            expect(cat.label).toBeTruthy();
        }
    });
});

describe('SUB_MENUS', () => {
    it('has all expected category keys', () => {
        expect(SUB_MENUS).toHaveProperty('reports');
        expect(SUB_MENUS).toHaveProperty('tests');
        expect(SUB_MENUS).toHaveProperty('releases');
        expect(SUB_MENUS).toHaveProperty('config');
    });

    it('each sub-menu has items with id and label', () => {
        for (const entry of Object.entries(SUB_MENUS)) {
            const [, items] = entry;
            expect(items.length).toBeGreaterThan(0);
            for (const item of items) {
                if (item.section) continue;
                expect(item.id).toBeTruthy();
                expect(item.label).toBeTruthy();
            }
        }
    });

    it('releases sub-menu contains version commands', () => {
        const releases = nonNull(SUB_MENUS.releases);
        const ids = releases.map((i) => i.id);
        expect(ids).toContain('2');
        expect(ids).toContain('3');
        expect(ids).toContain('7');
        expect(ids).toContain('8');
    });

    it('reports sub-menu has dashboards entry via d', () => {
        const reports = nonNull(SUB_MENUS.reports);
        const ids = reports.map((i) => i.id);
        expect(ids).toContain('d');
        expect(ids).toContain('17');
        expect(ids).not.toContain('25');
        expect(ids).not.toContain('26');
        expect(ids).not.toContain('27');
    });

    it('config sub-menu has configKey on directory items', () => {
        const configMenu = nonNull(SUB_MENUS.config);
        const gitItem = configMenu.find((i) => i.id === '10');
        expect(gitItem?.configKey).toBe('gitDir');
        const cypressItem = configMenu.find((i) => i.id === '14');
        expect(cypressItem?.configKey).toBe('cypressDir');
    });
});

describe('CATEGORY_IDS', () => {
    it('is a Set with all sub-menu keys', () => {
        expect(CATEGORY_IDS.has('reports')).toBe(true);
        expect(CATEGORY_IDS.has('tests')).toBe(true);
        expect(CATEGORY_IDS.has('releases')).toBe(true);
        expect(CATEGORY_IDS.has('nonexistent')).toBe(false);
    });

    it('is frozen from Object.keys', () => {
        expect(CATEGORY_IDS.size).toBe(Object.keys(SUB_MENUS).length);
    });
});

describe('CATEGORY_TITLES', () => {
    it('has titles for all categories', () => {
        for (const key of CATEGORY_IDS) {
            expect(CATEGORY_TITLES[key]).toBeTruthy();
        }
    });

    it('contains expected title strings', () => {
        expect(CATEGORY_TITLES.reports).toContain('RELATÓRIOS');
        expect(CATEGORY_TITLES.tests).toContain('TESTE');
        expect(CATEGORY_TITLES.releases).toContain('RELEASES');
    });
});

describe('ID_TO_ALIASES', () => {
    it('maps command IDs to their alias lists', () => {
        expect(ID_TO_ALIASES['1']).toContain('criar');
        expect(ID_TO_ALIASES['0']).toContain('sair');
        expect(ID_TO_ALIASES['11']).toContain('template');
    });

    it('includes all variants for each ID', () => {
        const criarAliases = ID_TO_ALIASES['1'];
        expect(criarAliases).toContain('criar');
        expect(criarAliases).toContain('criar-teste');
        expect(criarAliases).toContain('criar-testes');
    });

    it('covers all non-special command IDs from ALIASES', () => {
        for (const entry of Object.entries(ALIASES)) {
            const [, value] = entry;
            if (value.startsWith('/')) continue;
            expect(ID_TO_ALIASES[value]).toBeDefined();
        }
    });
});

describe('_configHint', () => {
    it('returns empty string for unknown key', () => {
        expect(_configHint('unknown', { git_directory: '/tmp' })).toBe('');
    });
});

describe('buildMenuChoices', () => {
    it('returns array for main level', () => {
        expect(Array.isArray(buildMenuChoices('main', 'ECSPOL', { git_directory: '/tmp' }))).toBe(true);
    });
});
