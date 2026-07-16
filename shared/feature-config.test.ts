import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootLogger } from './logger.js';
import { loadFeatureConfig, saveFeatureConfig } from './feature-config.js';
import { DEFAULT_PR_REPORT_CONFIG } from './types/feature-config.js';

type WarnSpy = MockInstance<typeof rootLogger.warn>;

describe('LoadFeatureConfig — LOG-01 (causa raiz do "PR Report disabled" em CI)', () => {
    let dir: string;
    let warnSpy: WarnSpy;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'featcfg-'));
        warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
        rmSync(dir, { recursive: true, force: true });
    });

    it('arquivo ausente emite warning explicito com a causa (nao silencia)', () => {
        const store = loadFeatureConfig(dir);

        expect(store).toStrictEqual({});

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('features.json'));
    });

    it('arquivo presente e valido nao emite warning', () => {
        const configDir = join(dir, 'config');
        mkdirSync(configDir, { recursive: true });
        writeFileSync(
            join(configDir, 'features.json'),
            JSON.stringify({
                myProj: {
                    gitProvider: 'github',
                    features: { prReport: { enabled: true, publishTarget: 'github-actions' } },
                },
            }),
        );

        const store = loadFeatureConfig(dir);

        expect(store).toStrictEqual({
            myProj: {
                gitProvider: 'github',
                features: { prReport: { enabled: true, publishTarget: 'github-actions' } },
            },
        });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('save + load round-trip preserva enabled', () => {
        const store = {
            myProj: {
                gitProvider: 'github' as const,
                features: { prReport: { enabled: true, publishTarget: 'github-actions' as const } },
            },
        };

        saveFeatureConfig(store, dir);

        const loaded = loadFeatureConfig(dir);

        expect(loaded).toStrictEqual(store);
        expect(loaded['myProj']?.features.prReport?.enabled).toBeTruthy();
    });

    it('default pr report config continua disabled por padrao (sem arquivo)', () => {
        expect(DEFAULT_PR_REPORT_CONFIG.enabled).toBeFalsy();
    });
});
