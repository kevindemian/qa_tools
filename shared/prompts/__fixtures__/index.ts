import fs from 'fs';
import path from 'path';

export interface FixtureBase {
    name: string;
    description: string;
}

export interface FailureAnalysisFixture extends FixtureBase {
    input: string;
    validate: {
        type: 'json-schema';
        schema: Record<string, unknown>;
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

const FIXTURE_DIR = __dirname;

function loadDir<T>(subdir: string): T[] {
    const dir = path.join(FIXTURE_DIR, subdir);
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as T);
    return files;
}

export function loadFailureAnalysisFixtures(): FailureAnalysisFixture[] {
    return loadDir<FailureAnalysisFixture>('failure-analysis');
}

export function loadUserStoryFixtures(): UserStoryFixture[] {
    return loadDir<UserStoryFixture>('user-story-to-tests');
}

export function loadClassifyFixtures(): ClassifyFixture[] {
    return loadDir<ClassifyFixture>('classify');
}
