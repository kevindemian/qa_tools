import fs from 'fs';
import path from 'path';
import { addProject, listProjects } from '../project-registry.js';
import { isValidProjectName } from '../project-paths.js';
import { projectEntrySchema, type ProjectEntry } from '../types/project.js';
import { rootLogger } from '../logger.js';

/**
 * Único módulo de migração legado→XDG (T2). Executa o cutover atômico (T1):
 * lê `config/projects.json` (formato antigo), converte para `ProjectEntry`,
 * registra no registry XDG e renomeia o legado para `.migrated`.
 *
 * Idempotente: projetos já existentes no registry são pulados (não duplicados).
 * Sem dual-write perpétuo: após esta função, `config/projects.json` deixa de existir.
 */

const LEGACY_DIR = 'config';
const LEGACY_FILE = 'projects.json';

export interface MigrationResult {
    migrated: number;
    skipped: number;
    renamed: boolean;
}

/** Resolve o path do legado `config/projects.json` relativo a um diretório base. */
export function legacyProjectsPath(baseDir: string = process.cwd()): string {
    return path.resolve(baseDir, LEGACY_DIR, LEGACY_FILE);
}

/**
 * Converte um valor legado (string id/repo OU objeto {provider, repo}) em `ProjectEntry`.
 * `dir` recebe `defaultDir` (PROJECT_ROOT, D1). `migrated: true` (D-U4).
 * Lança em nome inválido (path traversal) — nunca silenciado.
 */
export function parseLegacyEntry(name: string, raw: unknown, defaultDir: string): ProjectEntry {
    if (!isValidProjectName(name)) {
        throw new Error('Nome de projeto legado inválido (path traversal): ' + name);
    }

    let provider: string | undefined;
    let projectId: string | undefined;

    if (typeof raw === 'string') {
        projectId = raw;
    } else if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (typeof obj['provider'] === 'string') provider = obj['provider'];
        if (typeof obj['repo'] === 'string') projectId = obj['repo'];
        else if (typeof obj['projectId'] === 'string') projectId = obj['projectId'];
    }

    const entry: ProjectEntry = {
        name,
        dir: defaultDir,
        migrated: true,
    };
    if (provider) entry.provider = provider;
    if (projectId) entry.projectId = projectId;

    const parsed = projectEntrySchema.safeParse(entry);
    if (!parsed.success) {
        throw new Error('Entrada legada inválida para "' + name + '": ' + parsed.error.message);
    }
    return parsed.data;
}

/**
 * Migra o `config/projects.json` legado para o registry XDG.
 * - Ausente: no-op explícito (log informativo), retorna migrated=0.
 * - Presente: parseia cada entrada, registra (idempotente), renomeia legado → `.migrated`.
 * - Inválido: lança (não silencia).
 */
export function migrateLegacyProjects(baseDir: string = process.cwd()): MigrationResult {
    const legacyPath = legacyProjectsPath(baseDir);

    if (!fs.existsSync(legacyPath)) {
        rootLogger.info('Migração legado: nenhum config/projects.json encontrado — nada a migrar.');
        return { migrated: 0, skipped: 0, renamed: false };
    }

    let raw: unknown;
    try {
        raw = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    } catch (err) {
        throw new Error(
            'Migração legado: config/projects.json corrompido — ' + (err instanceof Error ? err.message : String(err)),
            { cause: err },
        );
    }

    if (!raw || typeof raw !== 'object') {
        throw new Error('Migração legado: config/projects.json não é um objeto de projetos.');
    }

    const legacy = raw as Record<string, unknown>;
    let migrated = 0;
    let skipped = 0;

    for (const [name, value] of Object.entries(legacy)) {
        const entry = parseLegacyEntry(name, value, baseDir);
        const existing = listProjects().map((p) => p.name);
        if (existing.includes(entry.name)) {
            skipped += 1;
            continue;
        }
        addProject(entry);
        migrated += 1;
    }

    const renamedPath = legacyPath + '.migrated';
    fs.renameSync(legacyPath, renamedPath);

    return { migrated, skipped, renamed: true };
}
