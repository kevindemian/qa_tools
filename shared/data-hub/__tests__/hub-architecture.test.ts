/**
 * Architecture — hub-first (F0.3): hub never fabricates computed fields.
 *
 * The DataHub is the SSOT for computed data (AGENTS.md Rule 5 / N6 hub-first).
 * A fabricated field (empty placeholder produced by calling a compute with
 * `null`/`undefined` just to fill `computed.*`) violates Rule 25 (zero
 * silencing) and the plan §0.3.
 *
 * Guards enforced here:
 * 1. `hub.ts` must NOT call `compareAiVsManual(null)` to fabricate `aiComparison`
 *    — the field is `undefined` (explicit absence, Rule 25.2).
 * 2. `hub.ts` must NOT call the `computeCrossSquad` wrapper — the wrapper that
 *    fabricated an empty result via `computeCrossSquadBenchmark(undefined)` is
 *    deleted (Q3) and the field is `undefined`.
 * 3. The migrated calculations live in the compute layer
 *    (`compute/ai-comparison.ts`, `compute/cross-squad-benchmark.ts`,
 *    `compute/requirement-score.ts`) — never embedded in the hub.
 *
 * This is a safety mechanism (AGENTS.md Rule 5): a regression that re-adds a
 * fabrication in the hub would silently reintroduce placeholder data.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const HUB_PATH = path.join(ROOT, 'shared/data-hub/hub.ts');

function readHub(): string {
    if (!existsSync(HUB_PATH)) throw new Error(`hub.ts not found: ${HUB_PATH}`);
    return readFileSync(HUB_PATH, 'utf8');
}

describe('Architecture — hub-first: no fabricated computed fields (F0.3)', () => {
    it('hub.ts does not fabricate aiComparison via compareAiVsManual(null)', () => {
        expect.hasAssertions();
        expect(readHub()).not.toMatch(/compareAiVsManual/);
    });

    it('hub.ts does not fabricate crossSquad via the computeCrossSquad wrapper', () => {
        expect.hasAssertions();
        expect(readHub()).not.toMatch(/computeCrossSquad/);
    });

    it('compute/cross-squad.ts wrapper (empty-fabricator) does not exist', () => {
        expect(existsSync(path.join(ROOT, 'shared/data-hub/compute/cross-squad.ts'))).toBeFalsy();
    });

    it('migrated calculations resolve from the compute layer', () => {
        expect(existsSync(path.join(ROOT, 'shared/data-hub/compute/ai-comparison.ts'))).toBeTruthy();
        expect(existsSync(path.join(ROOT, 'shared/data-hub/compute/cross-squad-benchmark.ts'))).toBeTruthy();
        expect(existsSync(path.join(ROOT, 'shared/data-hub/compute/requirement-score.ts'))).toBeTruthy();
    });
});
