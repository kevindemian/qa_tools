import type { TestCounts } from '../../types/data-hub.js';
import type { ArtifactParseResult } from '../artifact-parser.js';

export interface TestCountInput {
    parsedArtifacts?: Map<number, ArtifactParseResult[]> | undefined;
}

function fromParsedArtifacts(artifacts: Map<number, ArtifactParseResult[]>): TestCounts {
    const counts: TestCounts = { passed: 0, failed: 0, skipped: 0, total: 0 };
    for (const entries of artifacts.values()) {
        for (const artifact of entries) {
            counts.passed += artifact.data.stats.passed;
            counts.failed += artifact.data.stats.failed;
            counts.skipped += artifact.data.stats.skipped;
            counts.total += artifact.data.stats.total;
        }
    }
    return counts;
}

export function extractTestCounts(input: TestCountInput): TestCounts {
    if (input.parsedArtifacts && input.parsedArtifacts.size > 0) {
        return fromParsedArtifacts(input.parsedArtifacts);
    }
    return { passed: 0, failed: 0, skipped: 0, total: 0 };
}
