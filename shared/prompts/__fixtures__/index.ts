import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export interface FixtureBase {
    name: string;
    description: string;
}

export interface FailureAnalysisFixture extends FixtureBase {
    input: string;
    validate: {
        type: 'json-schema';
        minTests: number;
        expectedCategories?: string[];
    };
}

export interface UserStoryFixture extends FixtureBase {
    input: {
        story: string;
        criteria: string[];
    };
    validate: {
        type: 'json-array';
        minItems: number;
        itemSchema: Record<string, string>;
    };
}

export interface ClassifyFixture extends FixtureBase {
    input: {
        title: string;
        error: string;
    };
    expectedCategory: string;
}

const FixtureBaseSchema = z.object({
    name: z.string(),
    description: z.string(),
});

const FailureAnalysisFixtureSchema: z.ZodType<FailureAnalysisFixture> = FixtureBaseSchema.extend({
    input: z.string(),
    validate: z.object({
        type: z.literal('json-schema'),
        minTests: z.number(),
        expectedCategories: z.array(z.string()).optional(),
    }),
});

const UserStoryFixtureSchema: z.ZodType<UserStoryFixture> = FixtureBaseSchema.extend({
    input: z.object({
        story: z.string(),
        criteria: z.array(z.string()),
    }),
    validate: z.object({
        type: z.literal('json-array'),
        minItems: z.number(),
        itemSchema: z.record(z.string(), z.string()),
    }),
});

const ClassifyFixtureSchema: z.ZodType<ClassifyFixture> = FixtureBaseSchema.extend({
    input: z.object({
        title: z.string(),
        error: z.string(),
    }),
    expectedCategory: z.string(),
});

const FIXTURE_DIR = __dirname;

function loadDir<T>(subdir: string, schema: z.ZodType<T>): T[] {
    const dir = path.join(FIXTURE_DIR, subdir);
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
            const raw = fs.readFileSync(path.join(dir, f), 'utf8');
            const parsed: unknown = JSON.parse(raw);
            return schema.parse(parsed);
        });
    return files;
}

export function loadFailureAnalysisFixtures(): FailureAnalysisFixture[] {
    return loadDir('failure-analysis', FailureAnalysisFixtureSchema);
}

export function loadUserStoryFixtures(): UserStoryFixture[] {
    return loadDir('user-story-to-tests', UserStoryFixtureSchema);
}

export function loadClassifyFixtures(): ClassifyFixture[] {
    return loadDir('classify', ClassifyFixtureSchema);
}
