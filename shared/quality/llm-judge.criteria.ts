/**
 * LLM-judge criteria — per-feature semantic rubrics.
 *
 * Anti-echo requirement (plan §7): the judge must evaluate semantic axes the
 * deterministic floor does NOT measure, otherwise it merely replicates the
 * floor linearly. Each criterion declares which axes it intends to capture so
 * the rubric stays complementary to the floor's structural checks.
 */

/** A single judge metric: id, rubric instruction, and the grade scale. */
export interface JudgeCriterion {
    metricId: string;
    /** Semantic axis captured — must complement (not duplicate) the floor. */
    axis: string;
    /** Rubric prompt instructing the LLM (G-Eval chain-of-thought). */
    rubric: string;
    /** Ordered grade labels from worst to best. */
    grades: string[];
}

/** Mesored input shaped for the judge (feature-agnostic). */
export interface JudgeInput {
    /** Human-readable rendering of the generated artifact under evaluation. */
    artifact: string;
    /** Optional domain context to ground the judge (anchored, not free). */
    context?: string;
}

export interface JudgeCriteriaDefinition {
    featureId: string;
    criteria: JudgeCriterion[];
}

/**
 * Criteria for generated test cases (feature: case18).
 * Axes are semantic (realism, exclusivity, boundary insight) — structural
 * dimensions (step count, preconditions, EP/BVA conformance) belong to the floor.
 */
export const CASE18_JUDGE_CRITERIA: JudgeCriteriaDefinition = {
    featureId: 'case18',
    criteria: [
        {
            metricId: 'realism',
            axis: 'Whether generated steps describe a realistic, runnable user action sequence.',
            rubric: 'Evaluate how realistic and executable the generated test steps are. A realistic step is a concrete, observable user action (not abstract intent or dev-internal detail). Provide chain-of-thought reasoning, then score the realism rubric.',
            grades: ['Unrealistic', 'Partially realistic', 'Realistic'],
        },
        {
            metricId: 'exclusivity',
            axis: 'Whether each test case targets a distinct behavior rather than duplicating another.',
            rubric: 'Evaluate whether the test cases are behaviorally distinct. Two tests are duplicates if they exercise the same observable outcome through the same path. Provide chain-of-thought reasoning, then score the exclusivity rubric.',
            grades: ['Duplicative', 'Partially distinct', 'Distinct'],
        },
        {
            metricId: 'boundaryInsight',
            axis: 'Whether edge/boundary conditions that matter for this domain are surfaced.',
            rubric: 'Evaluate whether the test cases surface boundary or edge conditions relevant to the described acceptance criteria. Judge the insight of the chosen scenarios, not the count. Provide chain-of-thought reasoning, then score the boundary-insight rubric.',
            grades: ['No boundary insight', 'Some boundary insight', 'Strong boundary insight'],
        },
    ],
};

/**
 * Criteria for bug reports (feature: bug-report).
 * The floor does not score bugs (planned: no deterministic bug score), so these
 * axes carry the whole signal for this feature.
 */
export const BUG_REPORT_JUDGE_CRITERIA: JudgeCriteriaDefinition = {
    featureId: 'bug-report',
    criteria: [
        {
            metricId: 'reproducibility',
            axis: 'Whether steps to reproduce pin down a deterministic trigger sequence.',
            rubric: 'Evaluate whether the steps to reproduce are deterministic and complete enough to reliably trigger the reported bug. Vagueness and missing state context lower the score. Provide chain-of-thought reasoning, then score the reproducibility rubric.',
            grades: ['Not reproducible', 'Partially reproducible', 'Reproducible'],
        },
        {
            metricId: 'evidenceGroundedness',
            axis: 'Whether each reported field is supported by specific evidence from the description.',
            rubric: 'Evaluate whether the report fields (severity, component, expected vs actual) are grounded in concrete evidence rather than invented. Provide chain-of-thought reasoning, then score the evidence-groundedness rubric.',
            grades: ['Unfounded', 'Partially grounded', 'Fully grounded'],
        },
    ],
};

/**
 * Criteria for failure analysis (feature: failure-analysis).
 * Semantic axes complement the classifier's structural category assignment.
 */
export const FAILURE_ANALYSIS_JUDGE_CRITERIA: JudgeCriteriaDefinition = {
    featureId: 'failure-analysis',
    criteria: [
        {
            metricId: 'rootCausePlausibility',
            axis: 'Whether the identified root cause is a plausible explanation of the observed symptoms.',
            rubric: 'Evaluate whether the proposed root cause plausibly explains all reported symptoms without overreach. Provide chain-of-thought reasoning, then score the plausibility rubric.',
            grades: ['Implausible', 'Partially plausible', 'Plausible'],
        },
        {
            metricId: 'recommendationActionability',
            axis: 'Whether the recommendation is a concrete, actionable next step rather than vague advice.',
            rubric: 'Evaluate whether the recommendation is specific and actionable. Vague or non-prioritized advice lowers the score. Provide chain-of-thought reasoning, then score the actionability rubric.',
            grades: ['Not actionable', 'Partially actionable', 'Actionable'],
        },
    ],
};

const REGISTRY: Record<string, JudgeCriteriaDefinition> = {
    case18: CASE18_JUDGE_CRITERIA,
    'bug-report': BUG_REPORT_JUDGE_CRITERIA,
    'failure-analysis': FAILURE_ANALYSIS_JUDGE_CRITERIA,
};

/** Resolve criteria by feature id; throws on unknown feature (Rule 24). */
export function resolveJudgeCriteria(featureId: string): JudgeCriteriaDefinition {
    const definition = REGISTRY[featureId];
    if (!definition) {
        throw new Error(`resolveJudgeCriteria: unknown feature '${featureId}'`);
    }
    return definition;
}
