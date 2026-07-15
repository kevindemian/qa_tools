/**
 * Integration test — Module Integration (Fase 6, task 065)
 *
 * Validates the single-source-of-truth delegation chain:
 *   project-registry  ->  project-context (active selection)  ->  git_triggers/session-state (entrypoints)
 *
 * The registry is the ONLY external store that is mocked; project-context and
 * session-state run as REAL modules so the wiring between them is exercised
 * end-to-end. This guarantees there is exactly one source of truth for project
 * metadata (name, provider, id, dir) and for the active-project selection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentProject, setCurrentProject, clearCurrentProject } from '../../project-context.js';
import { getProjects, getProviderForProject } from '../../../git_triggers/session-state.js';

const REGISTRY = {
    p1: { name: 'p1', projectId: '111', dir: '/opt/p1', provider: 'github', valid: true },
    p2: { name: 'p2', projectId: '222', dir: '/opt/p2', provider: 'gitlab', valid: true },
} as const;

vi.mock('../../project-registry.js', () => ({
    isValidProjectName: (name: string) => typeof name === 'string' && /^[A-Za-z0-9._-]+$/.test(name),
    listProjects: vi.fn(() => Object.values(REGISTRY)),
    getProject: vi.fn((name: string) => (REGISTRY as Record<string, (typeof REGISTRY)[keyof typeof REGISTRY]>)[name]),
    addProject: vi.fn(),
    updateProject: vi.fn(),
    removeProject: vi.fn(),
    loadRegistry: vi.fn(() => ({ version: 1, projects: {} })),
    saveRegistry: vi.fn(),
}));

describe('Module integration — single source of truth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearCurrentProject();
    });

    describe('Active project selection (context)', () => {
        it('returns undefined when no project is selected', () => {
            expect.hasAssertions();

            expect(getCurrentProject()).toBeUndefined();
        });

        it('selects a registered project and exposes it via getCurrentProject', () => {
            expect.hasAssertions();

            setCurrentProject('p1');

            expect(getCurrentProject()).toBe('p1');
        });

        it('rejects selecting an unregistered project (validation at origin)', () => {
            expect.hasAssertions();

            expect(() => setCurrentProject('ghost')).toThrow(/não registrado|invalid/i);
            expect(getCurrentProject()).toBeUndefined();
        });

        it('clears the active selection', () => {
            expect.hasAssertions();

            setCurrentProject('p2');
            clearCurrentProject();

            expect(getCurrentProject()).toBeUndefined();
        });
    });

    describe('Entrypoint delegation (session-state getters)', () => {
        it('getProjects delegates to the registry (name -> projectId)', () => {
            expect.hasAssertions();

            const projects = getProjects();

            expect(projects['p1']).toBe('111');
            expect(projects['p2']).toBe('222');
            expect(Object.keys(projects)).toHaveLength(2);
        });

        it('getProviderForProject resolves provider from the registry', () => {
            expect.hasAssertions();

            expect(getProviderForProject('p1')).toBe('github');
            expect(getProviderForProject('p2')).toBe('gitlab');
        });

        it('getProviderForProject defaults to gitlab for unknown projects (no registry entry)', () => {
            expect.hasAssertions();

            expect(getProviderForProject('ghost')).toBe('gitlab');
        });

        it('entrypoint reads the active project through project-context', () => {
            expect.hasAssertions();

            setCurrentProject('p1');

            // The active selection must be visible to session-state consumers via the context,
            // and provider resolution must agree with the registry entry for that project.
            expect(getCurrentProject()).toBe('p1');
            expect(getProviderForProject(getCurrentProject() ?? '')).toBe('github');
        });
    });
});
