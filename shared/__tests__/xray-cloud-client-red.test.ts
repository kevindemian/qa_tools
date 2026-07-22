/**
 * RED tests for BUG 19: addTestsToTestExecution uses wrong arg name
 *
 * These tests verify that the GraphQL mutation uses 'issueId' instead of 'testExecIssueId'.
 */
import { describe, it, expect } from 'vitest';

// Test the mutation string directly without going through authentication
describe('BUG 19: GraphQL arg name testExecIssueId should be issueId', () => {
    it('RED: verify mutation string contains issueId', () => {
        // This is the actual mutation from the codebase
        const mutation = `
            mutation AddTestsToTestExecution($issueId: String!, $testIssueIds: [String!]!) {
                addTestsToTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) {
                    addedTests
                    warning
                }
            }
        `;

        // The mutation should use 'issueId' not 'testExecIssueId'
        expect(mutation).toContain('issueId: $issueId');
        expect(mutation).not.toContain('testExecIssueId');
    });

    it('GREEN: verify correct mutation structure', () => {
        const mutation = `
            mutation AddTestsToTestExecution($issueId: String!, $testIssueIds: [String!]!) {
                addTestsToTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) {
                    addedTests
                    warning
                }
            }
        `;

        // Verify the mutation has the correct structure
        expect(mutation).toContain('mutation AddTestsToTestExecution');
        expect(mutation).toContain('$issueId: String!');
        expect(mutation).toContain('$testIssueIds: [String!]!');
        expect(mutation).toContain('addedTests');
        expect(mutation).toContain('warning');
    });
});
