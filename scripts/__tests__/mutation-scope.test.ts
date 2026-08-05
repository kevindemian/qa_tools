import { describe, it, expect } from 'vitest';
import {
    parseGitDiff,
    buildMutatePatterns,
    isSourceFile,
    isTestFile,
    coalesceRanges,
    compactLines,
    normalizeRange,
    parseHunkHeader,
    buildDirFilter,
} from '../mutation-scope.js';

const DIFF = `diff --git a/git_triggers/two.ts b/git_triggers/two.ts
deleted file mode 100644
index 04ec35a..0000000
--- a/git_triggers/two.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-x
-y
-z
diff --git a/jira_management/one.ts b/jira_management/one.ts
index de98044..d68dd40 100644
--- a/jira_management/one.ts
+++ b/jira_management/one.ts
@@ -3,0 +4 @@ c
+d
diff --git a/shared/__tests__/date-utils.test.ts b/shared/__tests__/date-utils.test.ts
new file mode 100644
index 0000000..1011c1d
--- /dev/null
+++ b/shared/__tests__/date-utils.test.ts
@@ -0,0 +1,2 @@
+import { f } from "../../shared/date-utils";
+test("x", () => expect(f()).toBe(1));
diff --git a/shared/blob.bin b/shared/blob.bin
deleted file mode 100644
index 9b3c310..0000000
Binary files a/shared/blob.bin and /dev/null differ
diff --git a/shared/date-utils.ts b/shared/date-utils.ts
index b7c39c8..882dd74 100644
--- a/shared/date-utils.ts
+++ b/shared/date-utils.ts
@@ -2 +2,2 @@ export function formatDate(d: Date): string {
-  return d.toISOString();
+  return d.toISOString().slice(0, 10);
+  // added
@@ -3,0 +5 @@ export function formatDate(d: Date): string {
+export const FOO = 1;
diff --git a/shared/new-file.ts b/shared/new-file.ts
new file mode 100644
index 0000000..e563bc2
--- /dev/null
+++ b/shared/new-file.ts
@@ -0,0 +1,2 @@
+p
+q
diff --git a/shared/renamed.bin b/shared/renamed.bin
new file mode 100644
index 0000000..0bb0a86
Binary files /dev/null and b/shared/renamed.bin differ
diff --git a/shared/renamed.ts b/shared/renamed.ts
new file mode 100644
index 0000000..d8f7999
--- /dev/null
+++ b/shared/renamed.ts
@@ -0,0 +1 @@
+export const RENAMED = 2;
`;

describe('Mutation-scope parsing (git diff --unified=0)', () => {
    it('detects test files by directory segment', () => {
        expect.hasAssertions();

        const paths = ['shared/__tests__/date-utils.test.ts', 'shared/test/util.ts', 'shared/tests/util.ts'];

        for (const path of paths) {
            expect(isTestFile(path)).toBeTruthy();
        }
    });

    it('detects test files by filename suffix', () => {
        expect.hasAssertions();

        const paths = ['shared/date-utils.test.ts', 'shared/date-utils.spec.tsx', 'shared/date-utils.test.mjs'];

        for (const path of paths) {
            expect(isTestFile(path)).toBeTruthy();
        }
    });

    it('does not flag source-like paths as tests', () => {
        expect.hasAssertions();

        const paths = ['shared/date-utils.testing.ts', 'shared/date-utils.ts', 'shared/tester.ts', 'shared/probe.ts'];

        for (const path of paths) {
            expect(isTestFile(path)).toBeFalsy();
        }
    });

    it('accepts production source extensions', () => {
        expect.hasAssertions();

        const paths = ['shared/date-utils.ts', 'jira_management/one.tsx'];

        for (const path of paths) {
            expect(isSourceFile(path)).toBeTruthy();
        }
    });

    it('rejects tests, declarations, and configs as source', () => {
        expect.hasAssertions();

        const paths = [
            'shared/__tests__/date-utils.test.ts',
            'shared/types.d.ts',
            'vitest.config.ts',
            'shared/stryker.conf.json',
        ];

        for (const path of paths) {
            expect(isSourceFile(path)).toBeFalsy();
        }
    });

    it('parses hunk headers with and without counts, ignoring trailing context', () => {
        expect.hasAssertions();

        expect(parseHunkHeader('@@ -3,0 +4 @@ c')).toBe(4);
        expect(parseHunkHeader('@@ -2 +2,2 @@ export function formatDate(d: Date): string {')).toBe(2);
        expect(parseHunkHeader('@@ -0,0 +1,2 @@')).toBe(1);
        expect(parseHunkHeader('not a hunk')).toBeUndefined();
    });

    it('parses added lines into per-file ranges', () => {
        expect.hasAssertions();

        const files = parseGitDiff(DIFF);
        const byPath = new Map(files.map((file) => [file.path, file]));

        expect(byPath.get('jira_management/one.ts')?.ranges).toStrictEqual([{ start: 4, end: 4 }]);
        expect(byPath.get('shared/date-utils.ts')?.ranges).toStrictEqual([
            { start: 2, end: 3 },
            { start: 5, end: 5 },
        ]);
        expect(byPath.get('shared/new-file.ts')?.ranges).toStrictEqual([{ start: 1, end: 2 }]);
        expect(byPath.get('shared/renamed.ts')?.ranges).toStrictEqual([{ start: 1, end: 1 }]);
    });

    it('marks deleted files, binaries, and test files so the filter drops them', () => {
        expect.hasAssertions();

        const files = parseGitDiff(DIFF);
        const byPath = new Map(files.map((file) => [file.path, file]));

        expect(byPath.get('git_triggers/two.ts')?.status).toBe('deleted');
        expect(byPath.get('shared/blob.bin')?.isBinary).toBeTruthy();
        expect(byPath.get('shared/renamed.bin')?.isBinary).toBeTruthy();
        expect(byPath.get('shared/__tests__/date-utils.test.ts')?.isTest).toBeTruthy();
    });

    it('builds Stryker mutate patterns only from changed production source lines', () => {
        expect.hasAssertions();

        const patterns = buildMutatePatterns(DIFF);

        expect(patterns).toStrictEqual([
            'jira_management/one.ts:4-4',
            'shared/date-utils.ts:2-3',
            'shared/date-utils.ts:5-5',
            'shared/new-file.ts:1-2',
            'shared/renamed.ts:1-1',
        ]);
    });

    it('returns an empty pattern list when no production lines were added', () => {
        expect.hasAssertions();

        expect(buildMutatePatterns('')).toStrictEqual([]);
        expect(buildMutatePatterns('diff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n-old\n+new\n')).toStrictEqual(['x.ts:1-1']);
    });
});

describe('Dir bucket scoping (--dir)', () => {
    it('matches files strictly under the directory prefix', () => {
        expect.hasAssertions();

        const filter = buildDirFilter(['shared/data-hub']);

        expect(filter('shared/data-hub/hub.ts')).toBeTruthy();
        expect(filter('shared/data-hub/compute/coverage-gap.ts')).toBeTruthy();
        expect(filter('shared/data-hub/hub.test.ts')).toBeTruthy();
        expect(filter('shared/report/report-html.ts')).toBeFalsy();
        expect(filter('shared/data-hub-extra/x.ts')).toBeFalsy();
    });

    it('matches the special "root" bucket for top-level files only', () => {
        expect.hasAssertions();

        const filter = buildDirFilter(['shared/root']);

        expect(filter('shared/env-loader.ts')).toBeTruthy();
        expect(filter('shared/pr-report-core.ts')).toBeTruthy();
        expect(filter('shared/icons.ts')).toBeTruthy();
        expect(filter('shared/data-hub/hub.ts')).toBeFalsy();
        expect(filter('shared/report/report-html.ts')).toBeFalsy();
    });

    it('matches the jira_management and git_triggers top-level buckets', () => {
        expect.hasAssertions();

        const filterJira = buildDirFilter(['jira_management/root']);

        expect(filterJira('jira_management/main.ts')).toBeTruthy();
        expect(filterJira('jira_management/handlers/jira-handler.ts')).toBeFalsy();

        const filterGit = buildDirFilter(['git_triggers/root']);

        expect(filterGit('git_triggers/main.ts')).toBeTruthy();
        expect(filterGit('git_triggers/__tests__/main.test.ts')).toBeFalsy();
    });

    it('matches any of several prefixes in a single bucket', () => {
        expect.hasAssertions();

        const filter = buildDirFilter(['shared/ui', 'shared/primitives']);

        expect(filter('shared/ui/badge.ts')).toBeTruthy();
        expect(filter('shared/primitives/report-styles.ts')).toBeTruthy();
        expect(filter('shared/report/report-html.ts')).toBeFalsy();
    });
});

describe('Build mutate patterns with dir scoping', () => {
    it('filters patterns to the requested directory bucket', () => {
        expect.hasAssertions();

        expect(buildMutatePatterns(DIFF, ['jira_management/root'])).toStrictEqual(['jira_management/one.ts:4-4']);
        expect(buildMutatePatterns(DIFF, ['shared/root'])).toStrictEqual([
            'shared/date-utils.ts:2-3',
            'shared/date-utils.ts:5-5',
            'shared/new-file.ts:1-2',
            'shared/renamed.ts:1-1',
        ]);
        expect(buildMutatePatterns(DIFF, ['shared/data-hub'])).toStrictEqual([]);
    });

    it('returns empty list when a bucket has no changed files (job skips)', () => {
        expect.hasAssertions();

        expect(buildMutatePatterns(DIFF, ['shared/validation'])).toStrictEqual([]);
    });
});

describe('Range helpers', () => {
    it('coalesces overlapping and adjacent ranges', () => {
        expect.hasAssertions();

        const ranges = coalesceRanges([
            { start: 1, end: 2 },
            { start: 2, end: 5 },
            { start: 10, end: 12 },
        ]);

        expect(ranges).toStrictEqual([
            { start: 1, end: 5 },
            { start: 10, end: 12 },
        ]);
    });

    it('normalizes inverted and zero ranges', () => {
        expect.hasAssertions();

        expect(normalizeRange({ start: 9, end: 3 })).toStrictEqual({ start: 3, end: 9 });
        expect(normalizeRange({ start: 0, end: 0 })).toStrictEqual({ start: 1, end: 1 });
    });

    it('compacts consecutive lines into contiguous ranges', () => {
        expect.hasAssertions();

        const ranges = compactLines(new Set([1, 2, 3, 7, 8, 15]));

        expect(ranges).toStrictEqual([
            { start: 1, end: 3 },
            { start: 7, end: 8 },
            { start: 15, end: 15 },
        ]);
    });
});
