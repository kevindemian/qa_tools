/**
 * Case18 Quality Evaluator — Benchmarks
 *
 * Calibration data for quality evaluation.
 * Primary: ECSPOL-960 (14 real test cases, human-validated)
 * Synthetic: BVA, EP, State Transition, Error Guessing scenarios
 */
import type { GeneratedTestCase } from './case18-types.js';

// --- ECSPOL-960 Baseline (real data) ---

/** ECSPOL-960 user story and acceptance criteria (from CSV import). */
export const ECSPOL960_STORY = {
    title: 'Policy Connections — Regulations',
    description: `As a policy owner, I want to connect regulations to my policy so that I can manage regulatory compliance.

Acceptance Criteria:
1. Regulations section is displayed on the Policy Details page
2. Connected regulations are shown in the Regulations grid
3. Connect Regulations action is available in the Connections tab
4. Policy owner can access the Connect Regulations action
5. Non-owner cannot connect regulations
6. Connect Regulations modal allows search and selection
7. Duplicate regulation selection is prevented
8. Regulation connections are submitted and grid updates
9. Empty state is displayed when no regulations are connected
10. Default view shows 3 regulations
11. Visible rows can be adjusted and reset after refresh
12. Pagination applies independently to Regulations grid
13. Sorting applies independently to Regulations grid
14. Header stays static while interacting with grid`,
};

/** ECSPOL-960 baseline test cases (converted from Jira mapping format). */
export const ECSPOL960_BASELINE: GeneratedTestCase[] = [
    {
        title: 'Display Regulations section and connected regulations',
        steps: ['Open Policy Details page', 'Review Regulations section', 'Review displayed regulations'],
        expectedResult: 'Regulations section is displayed with connected regulations',
        coverage: [
            { criterionId: 'C-1', criterionText: 'Regulations section is displayed on the Policy Details page' },
        ],
        evidence: ['Policy Details page must show Regulations section'],
    },
    {
        title: 'Display Connect Regulations action in Connections tab',
        steps: ['Open Connections tab', 'Review available actions'],
        expectedResult: 'Connect Regulations action is displayed',
        coverage: [
            { criterionId: 'C-3', criterionText: 'Connect Regulations action is available in the Connections tab' },
        ],
        evidence: ['Connections tab must show Connect Regulations action'],
    },
    {
        title: 'Allow policy owner to connect regulations',
        steps: ['Open Connections tab as policy owner', 'Review available actions'],
        expectedResult: 'Connect Regulations action is available for policy owner',
        coverage: [{ criterionId: 'C-4', criterionText: 'Policy owner can access the Connect Regulations action' }],
        evidence: ['Policy owner must have access to Connect Regulations'],
    },
    {
        title: 'Prevent non-owner from connecting regulations',
        steps: ['Open Connections tab as non-owner', 'Review available actions'],
        expectedResult: 'Connect Regulations action is not available for execution',
        coverage: [{ criterionId: 'C-5', criterionText: 'Non-owner cannot connect regulations' }],
        evidence: ['Non-owner must not have access to Connect Regulations'],
    },
    {
        title: 'Display Connect Regulations modal',
        steps: ['Click Connect Regulations action', 'Review modal content'],
        expectedResult: 'Connect Regulations modal is displayed with search and selection',
        coverage: [{ criterionId: 'C-6', criterionText: 'Connect Regulations modal allows search and selection' }],
        evidence: ['Modal must allow search and selection of regulations'],
    },
    {
        title: 'Search and select one or multiple regulations',
        steps: ['Open Connect Regulations modal', 'Search for regulations', 'Select one or multiple regulations'],
        expectedResult: 'Regulations can be searched and selected',
        coverage: [{ criterionId: 'C-6', criterionText: 'Connect Regulations modal allows search and selection' }],
        evidence: ['Search and selection must work correctly'],
    },
    {
        title: 'Prevent duplicate regulation selection',
        steps: ['Open Connect Regulations modal', 'Select a regulation', 'Attempt to select the same regulation again'],
        expectedResult: 'Duplicate regulation is not selected',
        coverage: [{ criterionId: 'C-7', criterionText: 'Duplicate regulation selection is prevented' }],
        evidence: ['System must prevent duplicate selection'],
    },
    {
        title: 'Submit regulation connections and update grid',
        steps: ['Select regulations in modal', 'Click Submit', 'Review Regulations grid'],
        expectedResult: 'Regulation connections are saved and grid updates',
        coverage: [{ criterionId: 'C-8', criterionText: 'Regulation connections are submitted and grid updates' }],
        evidence: ['Grid must update after submission'],
    },
    {
        title: 'Display empty state when no regulations are connected',
        steps: ['Open Policy Details page', 'Review Regulations section'],
        expectedResult: 'Empty state is displayed when no regulations are connected',
        coverage: [{ criterionId: 'C-9', criterionText: 'Empty state is displayed when no regulations are connected' }],
        evidence: ['Empty state must be shown'],
    },
    {
        title: 'Display 3 regulations by default',
        steps: ['Open Policy Details page', 'Review Regulations grid'],
        expectedResult: 'Regulations grid displays 3 regulations by default',
        coverage: [{ criterionId: 'C-10', criterionText: 'Default view shows 3 regulations' }],
        evidence: ['Default view must show 3 regulations'],
    },
    {
        title: 'Adjust visible rows and reset after refresh',
        steps: ['Open Policy Details page', 'Adjust visible rows', 'Refresh page'],
        expectedResult: 'Visible rows are adjusted and reset after refresh',
        coverage: [{ criterionId: 'C-11', criterionText: 'Visible rows can be adjusted and reset after refresh' }],
        evidence: ['Row adjustment must work and reset on refresh'],
    },
    {
        title: 'Apply pagination independently to Regulations grid',
        steps: ['Open Policy Details page', 'Navigate through pagination'],
        expectedResult: 'Pagination applies independently to Regulations grid',
        coverage: [{ criterionId: 'C-12', criterionText: 'Pagination applies independently to Regulations grid' }],
        evidence: ['Pagination must work independently'],
    },
    {
        title: 'Apply sorting independently to Regulations grid',
        steps: ['Open Policy Details page', 'Sort columns in Regulations grid'],
        expectedResult: 'Sorting applies independently to Regulations grid',
        coverage: [{ criterionId: 'C-13', criterionText: 'Sorting applies independently to Regulations grid' }],
        evidence: ['Sorting must work independently'],
    },
    {
        title: 'Keep header static while interacting with Regulations grid',
        steps: ['Open Policy Details page', 'Scroll through Regulations grid'],
        expectedResult: 'Header stays static while scrolling',
        coverage: [{ criterionId: 'C-14', criterionText: 'Header stays static while interacting with grid' }],
        evidence: ['Header must remain fixed'],
    },
];

// --- Synthetic Benchmarks ---

/** BVA benchmark: tests boundary value analysis for numeric ranges. */
export const BVA_BENCHMARK = {
    story: 'User must be between 18 and 65 years old to register',
    criteria: 'Age range: 18-65',
    expected: {
        boundaries: [17, 18, 65, 66],
        minTests: 4,
    },
};

/** EP benchmark: tests equivalence partitioning. */
export const EP_BENCHMARK = {
    story: 'Email field must be valid format',
    criteria: 'Email validation: valid format required',
    expected: {
        validPartitions: ['user@example.com', 'test.name@domain.co'],
        invalidPartitions: ['empty', 'null', 'no-at-sign', 'no-domain'],
    },
};

/** State Transition benchmark: tests valid/invalid transitions. */
export const STATE_TRANSITION_BENCHMARK = {
    story: 'Order status can transition from pending to shipped to delivered',
    criteria: 'Order lifecycle: pending → shipped → delivered',
    expected: {
        validTransitions: ['pending to shipped', 'shipped to delivered'],
        invalidTransitions: ['delivered to pending', 'shipped to pending'],
    },
};

/** Error Guessing benchmark: tests common error scenarios. */
export const ERROR_GUESSING_BENCHMARK = {
    story: 'Form submission with required fields',
    criteria: 'Form must validate required fields',
    expected: {
        errorTests: ['empty field', 'null value', 'special characters', 'max length exceeded'],
    },
};
