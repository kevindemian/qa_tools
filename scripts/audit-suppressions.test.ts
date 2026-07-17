import { describe, it, expect } from 'vitest';
import {
    thresholdForCount,
    computeExpectedThreshold,
    THRESHOLD_TABLE,
    SUNSET_DAYS,
    parseYamlSimple,
} from './audit-suppressions.js';

describe('Audit-suppressions threshold mapping (C1)', () => {
    it('mapeia contador para teto conforme tabela hardcoded', () => {
        expect(thresholdForCount(306)).toBe(50);
        expect(thresholdForCount(250)).toBe(50);
        expect(thresholdForCount(200)).toBe(60);
        expect(thresholdForCount(150)).toBe(60);
        expect(thresholdForCount(120)).toBe(70);
        expect(thresholdForCount(50)).toBe(70);
        expect(thresholdForCount(0)).toBe(75);
    });

    it('tabela hardcoded nao pode ser alterada (imutabilidade)', () => {
        expect(THRESHOLD_TABLE).toStrictEqual([
            [306, 50],
            [200, 60],
            [120, 70],
            [0, 75],
        ]);
    });

    it('sem trava temporal: teto segue o contador', () => {
        const recent = new Date().toISOString().slice(0, 10);

        expect(computeExpectedThreshold(306, recent)).toBe(50);
        expect(computeExpectedThreshold(0, recent)).toBe(75);
    });

    it('trava temporal de 90d: sobe o teto mesmo com contador alto', () => {
        const old = '2000-01-01';

        expect(computeExpectedThreshold(306, old)).toBe(75);
        expect(computeExpectedThreshold(200, old)).toBe(75);
    });

    it('no limite superior da tabela (306) o teto e 50', () => {
        expect(thresholdForCount(306)).toBe(50);
    });

    // FINDING (AGENTS §7): a tabela so cobre count <= 306. Para count > 306,
    // thresholdForCount retorna 0 (nenhum teto). Isso e um gap de dominio: se as
    // supressoes ultrapassarem o baseline, o teto de mutation cai para 0%.
    // Documentado como debito; correcao exige chattr -i + aprovacao (arquivo imutavel).
    it('acima do baseline (306) a tabela nao define teto — retorna 0 (gap documentado)', () => {
        expect(thresholdForCount(307)).toBe(0);
    });

    it('measured_at ausente nao aciona a trava temporal (Infinity elapsed guardado)', () => {
        // daysSince(undefined) => Infinity => trava considerada esgotada => teto minimo 75.
        expect(computeExpectedThreshold(306, undefined)).toBe(75);
    });

    it('sUNSET_DAYS e a janela de trava documentada (90d)', () => {
        expect(SUNSET_DAYS).toBe(90);
    });
});

describe('Parser parseYamlSimple de audit/suppressions.yaml', () => {
    it('extrai meta measured_at e baseline_count', () => {
        const yaml = ['meta:', "  measured_at: '2026-07-16'", '  baseline_count: 306', 'suppressions:'].join('\n');
        const parsed = parseYamlSimple(yaml);

        expect(parsed.meta?.measured_at).toBe('2026-07-16');
        expect(parsed.meta?.baseline_count).toBe(306);
        expect(parsed.suppressions).toStrictEqual([]);
    });

    it('parseia entradas com campos indentados apos o marcador de lista', () => {
        const yaml = [
            'suppressions:',
            '  - file: shared/foo.ts',
            '    line: "42"',
            '    rule: local-no-swallow/no-swallow',
            '    kind: catch',
            '    reason: legacy migration',
            '    owner: team-qa',
            '    sunset: 2026-07-23',
            '    status: active',
        ].join('\n');
        const parsed = parseYamlSimple(yaml);

        expect(parsed.suppressions).toHaveLength(1);
        expect(parsed.suppressions[0]).toStrictEqual({
            file: 'shared/foo.ts',
            line: '42',
            rule: 'local-no-swallow/no-swallow',
            kind: 'catch',
            reason: 'legacy migration',
            owner: 'team-qa',
            sunset: '2026-07-23',
            status: 'active',
        });
    });

    it('parseia campo inline no proprio marcador de lista', () => {
        const yaml = ['suppressions:', '  - file: shared/inline.ts', '    owner: dev'].join('\n');
        const parsed = parseYamlSimple(yaml);

        expect(parsed.suppressions).toHaveLength(1);
        expect(parsed.suppressions[0]?.file).toBe('shared/inline.ts');
        expect(parsed.suppressions[0]?.owner).toBe('dev');
    });

    it('remove aspas simples e duplas dos valores', () => {
        const yaml = ['suppressions:', '  - reason: "quoted double"', "    owner: 'quoted single'"].join('\n');
        const parsed = parseYamlSimple(yaml);

        expect(parsed.suppressions[0]?.reason).toBe('quoted double');
        expect(parsed.suppressions[0]?.owner).toBe('quoted single');
    });

    it('parseia multiplas entradas e encerra na proxima chave top-level', () => {
        const yaml = [
            'suppressions:',
            '  - file: a.ts',
            '    owner: o1',
            '  - file: b.ts',
            '    owner: o2',
            'trailing_key: ignored',
            '  - file: c.ts',
        ].join('\n');
        const parsed = parseYamlSimple(yaml);

        expect(parsed.suppressions.map((e) => e.file)).toStrictEqual(['a.ts', 'b.ts']);
    });

    it('retorna lista vazia quando nao ha secao suppressions', () => {
        const parsed = parseYamlSimple('meta:\n  baseline_count: 0\n');

        expect(parsed.suppressions).toStrictEqual([]);
        expect(parsed.meta?.baseline_count).toBe(0);
    });

    it('ignora campos desconhecidos sem quebrar a entrada', () => {
        const yaml = ['suppressions:', '  - file: known.ts', '    unknown_field: whatever', '    owner: o'].join('\n');
        const parsed = parseYamlSimple(yaml);

        expect(parsed.suppressions[0]?.file).toBe('known.ts');
        expect(parsed.suppressions[0]?.owner).toBe('o');
        expect(parsed.suppressions[0]).not.toHaveProperty('unknown_field');
    });
});
