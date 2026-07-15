import { describe, expect, it } from 'vitest';
import type { ListedProject } from '../project-registry.js';
import {
    isProjectProtected,
    resolveProjectChoice,
    resolveManageChoice,
    resolveManageOneAction,
    moduleScript,
} from '../entry-menu-logic.js';

function p(name: string, over: Partial<ListedProject> = {}): ListedProject {
    return { name, dir: '/d/' + name, valid: true, ...over };
}

describe('Entry-menu-logic (Fase 5 pure decisions)', () => {
    it('isProjectProtected only when migrated', () => {
        expect.hasAssertions();

        expect(isProjectProtected(p('a'))).toBeFalsy();
        expect(isProjectProtected(p('a', { migrated: true }))).toBeTruthy();
    });

    it('resolveProjectChoice maps add/manage/none/invalid/select', () => {
        expect.hasAssertions();

        const projects = [p('a'), p('b')];

        expect(resolveProjectChoice('__add__', projects)).toStrictEqual({ kind: 'add' });
        expect(resolveProjectChoice('__manage__', projects)).toStrictEqual({ kind: 'manage' });
        expect(resolveProjectChoice(undefined, projects)).toStrictEqual({ kind: 'none' });
        expect(resolveProjectChoice('', projects)).toStrictEqual({ kind: 'none' });
        expect(resolveProjectChoice('zzz', projects)).toStrictEqual({ kind: 'invalid', choice: 'zzz' });
        expect(resolveProjectChoice('a', projects)).toStrictEqual({ kind: 'select', project: p('a') });
    });

    it('resolveManageChoice maps back/unknown/protected/manage', () => {
        expect.hasAssertions();

        const projects = [p('a'), p('m', { migrated: true })];

        expect(resolveManageChoice('__back__', projects)).toStrictEqual({ kind: 'back' });
        expect(resolveManageChoice('zzz', projects)).toStrictEqual({ kind: 'unknown' });
        expect(resolveManageChoice('m', projects)).toStrictEqual({
            kind: 'protected',
            project: p('m', { migrated: true }),
        });
        expect(resolveManageChoice('a', projects)).toStrictEqual({ kind: 'manage', project: p('a') });
    });

    it('resolveManageOneAction maps edit/remove/back and rejects unknown', () => {
        expect.hasAssertions();

        expect(resolveManageOneAction('__back__')).toBe('back');
        expect(resolveManageOneAction('edit')).toBe('edit');
        expect(resolveManageOneAction('remove')).toBe('remove');
        expect(resolveManageOneAction('weird')).toBeNull();
        expect(resolveManageOneAction(undefined)).toBeNull();
    });

    it('moduleScript resolves jira/git entry scripts', () => {
        expect.hasAssertions();

        expect(moduleScript('jira')).toBe('jira_management/main.ts');
        expect(moduleScript('git')).toBe('git_triggers/main.ts');
    });
});
