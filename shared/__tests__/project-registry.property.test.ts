import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addProject, getProject, listProjects, removeProject } from '../project-registry.js';

describe('Project Registry (property)', () => {
    let TMP: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'project-registry-pbt-'));
        process.env['XDG_CONFIG_HOME'] = TMP;
    });

    afterEach(() => {
        delete process.env['XDG_CONFIG_HOME'];
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    const nameArb = fc.string({ minLength: 1, maxLength: 40 });
    const dirArb = fc.string({ minLength: 1, maxLength: 40 });

    it('round-trip add -> get preserves name and dir', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(nameArb, dirArb, (name, dir) => {
                addProject({ name, dir });
                const got = getProject(name);

                expect(got?.name).toBe(name);
                expect(got?.dir).toBe(dir);
            }),
            { numRuns: 100 },
        );
    });

    it('listProjects always returns an array', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(nameArb, (name) => {
                addProject({ name, dir: TMP });

                expect(Array.isArray(listProjects())).toBeTruthy();
            }),
            { numRuns: 100 },
        );
    });

    it('removeProject removes exactly what was added', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(nameArb, dirArb, (name, dir) => {
                addProject({ name, dir });

                expect(removeProject(name)).toBeTruthy();
                expect(getProject(name)).toBeUndefined();
            }),
            { numRuns: 100 },
        );
    });
});
