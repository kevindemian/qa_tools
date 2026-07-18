import { ArtifactValidator } from '../validation/artifact-validator.js';
import {
    invariantNoPlaceholder,
    invariantNoMarkdown,
    invariantEvidenceExists,
    invariantNoEmptyStrings,
    invariantConclusionHasEvidence,
} from '../validation/shared-invariants.js';
import { invariantCoverageComplete } from './t-01.js';
import { invariantCoverageThreshold } from './t-02.js';
import { invariantStateMutation } from './t-03.js';
import { invariantConcreteSteps } from './t-04.js';
import { invariantVerifiableResult } from './t-05.js';
import { invariantUniqueTitles } from './t-06.js';
import { invariantPreconditionsExist } from './t-07.js';
import { invariantResultMatchesAction } from './t-08.js';
import { invariantNumericConsistency } from './t-09.js';
import { invariantNoDuplicateTests } from './t-10.js';
import { invariantPartitionCoverage } from './t-11.js';
import { invariantBoundaryCoverage } from './t-12.js';
import { invariantRedundancyCoupling } from './t-13.js';

export function createTestCaseValidator(): ArtifactValidator<unknown> {
    const validator = new ArtifactValidator<unknown>('test-suite');
    validator.addInvariant('I-01', invariantNoPlaceholder);
    validator.addInvariant('I-02', invariantNoMarkdown);
    validator.addInvariant('I-03', invariantEvidenceExists);
    validator.addInvariant('I-04', invariantNoEmptyStrings);
    validator.addInvariant('I-05', invariantConclusionHasEvidence);
    validator.addInvariant('T-01', invariantCoverageComplete);
    validator.addInvariant('T-02', invariantCoverageThreshold);
    validator.addInvariant('T-03', invariantStateMutation);
    validator.addInvariant('T-04', invariantConcreteSteps);
    validator.addInvariant('T-05', invariantVerifiableResult);
    validator.addInvariant('T-06', invariantUniqueTitles);
    validator.addInvariant('T-07', invariantPreconditionsExist);
    validator.addInvariant('T-08', invariantResultMatchesAction);
    validator.addInvariant('T-09', invariantNumericConsistency);
    validator.addInvariant('T-10', invariantNoDuplicateTests);
    validator.addInvariant('T-11', invariantPartitionCoverage);
    validator.addInvariant('T-12', invariantBoundaryCoverage);
    validator.addInvariant('T-13', invariantRedundancyCoupling);
    return validator;
}

export {
    invariantCoverageComplete,
    invariantCoverageThreshold,
    invariantStateMutation,
    invariantConcreteSteps,
    invariantVerifiableResult,
    invariantUniqueTitles,
    invariantPreconditionsExist,
    invariantResultMatchesAction,
    invariantNumericConsistency,
    invariantNoDuplicateTests,
    invariantPartitionCoverage,
    invariantBoundaryCoverage,
    invariantRedundancyCoupling,
};
