import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rootLogger } from '../../logger.js';
import { migrateLegacyProjects, parseLegacyEntry, legacyProjectsPath } from '../../migration/migrate-projects.js';
import { listProjects, removeProject } from '../../project-registry.js';

/** Cria um diretório temporário isolado (não usa cwd do repo). */
function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-mig-'));
    return dir;
}

describe('Migrate-projects (Fase 8)', () => {
    let tmp: string;

    beforeEach(() => {
        tmp = makeTempDir();
        fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        for (const p of listProjects()) {
            try {
                removeProject(p.name);
            } catch (err) {
                rootLogger.warn(
                    `cleanup: failed to remove project ${p.name}: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
    });

    it('retorna migrated=0 quando não há legado', () => {
        const result = migrateLegacyProjects(tmp);

        expect(result).toStrictEqual({ migrated: 0, skipped: 0, renamed: false });
    });

    it('migra entradas string (id/repo) para registry XDG e renomeia legado', () => {
        fs.writeFileSync(legacyProjectsPath(tmp), JSON.stringify({ alpha: 'repo-a', beta: 'repo-b' }), 'utf8');

        const result = migrateLegacyProjects(tmp);

        expect(result.migrated).toBe(2);
        expect(result.skipped).toBe(0);
        expect(result.renamed).toBeTruthy();
        expect(fs.existsSync(legacyProjectsPath(tmp))).toBeFalsy();
        expect(fs.existsSync(legacyProjectsPath(tmp) + '.migrated')).toBeTruthy();

        const names = listProjects()
            .map((p) => p.name)
            .sort((a, b) => a.localeCompare(b));

        expect(names).toStrictEqual(['alpha', 'beta']);
    });

    it('popula campos do entry migrado (projectId/dir/migrated)', () => {
        fs.writeFileSync(legacyProjectsPath(tmp), JSON.stringify({ alpha: 'repo-a', beta: 'repo-b' }), 'utf8');

        migrateLegacyProjects(tmp);

        const alpha = listProjects().find((p) => p.name === 'alpha');

        expect(alpha?.projectId).toBe('repo-a');
        expect(alpha?.dir).toBe(tmp);
        expect(alpha?.migrated).toBeTruthy();
    });

    it('migra entradas objeto {provider, repo}', () => {
        fs.writeFileSync(
            legacyProjectsPath(tmp),
            JSON.stringify({ gamma: { provider: 'gitlab', repo: 'grp/gamma' } }),
            'utf8',
        );

        const result = migrateLegacyProjects(tmp);

        expect(result.migrated).toBe(1);

        const gamma = listProjects().find((p) => p.name === 'gamma');

        expect(gamma?.provider).toBe('gitlab');
        expect(gamma?.projectId).toBe('grp/gamma');
        expect(gamma?.migrated).toBeTruthy();
    });

    it('é idempotente: segunda execução não duplica nem sobe erro', () => {
        fs.writeFileSync(legacyProjectsPath(tmp), JSON.stringify({ delta: 'r' }), 'utf8');
        const first = migrateLegacyProjects(tmp);

        expect(first.migrated).toBe(1);

        const result2 = migrateLegacyProjects(tmp);

        expect(result2.migrated).toBe(0);
        expect(result2.skipped).toBe(0);
        expect(result2.renamed).toBeFalsy();
        expect(listProjects()).toHaveLength(1);
    });

    it('pula entradas já existentes no registry (skipped)', () => {
        fs.writeFileSync(legacyProjectsPath(tmp), JSON.stringify({ exists: 'x' }), 'utf8');
        migrateLegacyProjects(tmp);

        fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
        fs.writeFileSync(legacyProjectsPath(tmp), JSON.stringify({ exists: 'y', novo: 'z' }), 'utf8');
        const second = migrateLegacyProjects(tmp);

        expect(second.skipped).toBe(1);
        expect(second.migrated).toBe(1);
        expect(listProjects().find((p) => p.name === 'exists')?.projectId).toBe('x');
    });

    it('lança em nome inválido (path traversal) e NÃO silencia', () => {
        fs.writeFileSync(legacyProjectsPath(tmp), JSON.stringify({ '../evil': 'x' }), 'utf8');

        expect(() => migrateLegacyProjects(tmp)).toThrow(/inválido/);
    });

    it('lança em JSON corrompido', () => {
        fs.writeFileSync(legacyProjectsPath(tmp), '{not json', 'utf8');

        expect(() => migrateLegacyProjects(tmp)).toThrow(/corrompido/);
    });
});

describe('ParseLegacyEntry (Fase 8)', () => {
    it('rejeita nome inválido', () => {
        expect(() => parseLegacyEntry('../x', 'v', '/tmp')).toThrow(/inválido/);
    });

    it('converte string com migrated=true', () => {
        const e = parseLegacyEntry('p1', 'id1', '/base');

        expect(e).toMatchObject({ name: 'p1', dir: '/base', projectId: 'id1', migrated: true });
    });

    it('converte objeto com provider+projectId', () => {
        const e = parseLegacyEntry('p2', { provider: 'gh', projectId: 'pid' }, '/base');

        expect(e).toMatchObject({ name: 'p2', provider: 'gh', projectId: 'pid', migrated: true });
    });
});
