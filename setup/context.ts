export type Framework = 'cypress' | 'playwright' | 'jest' | 'vitest' | 'generic';
export type GitProvider = 'github' | 'gitlab';

/**
 * Describes how the project generates test reports.
 * - 'config-file': Reporter is configured in a config file (project already has it)
 * - 'cli-flag': Reporter is added via --reporter CLI flag (framework default)
 * - 'missing': No reporter detected; wizard should suggest installation
 */
export type TestReportSource = 'config-file' | 'cli-flag' | 'missing';

export interface SetupContext {
    projectName: string;
    framework: Framework;
    /** Path to test report files (CTRF/JUnit/Mochawesome). Used by ci-injector for artifact upload. */
    testReportPath: string;
    /** Name of the artifact to upload test reports as. DataHub uses this to find artifacts. */
    artifactName: string;
    testReportSource: TestReportSource;
    nodeVersion: string;
    installCmd: string;
    testCmd: string;
    gitProvider: GitProvider;
    repoOwner: string;
    repoName: string;
    /** Jira project key (optional). Persisted on the registry entry (D-U3). */
    jiraKey?: string;
    workflowDir: string;
    features: {
        qualityGate: boolean;
        flakinessDashboard: boolean;
        aiFailureAnalysis: boolean;
        prePushHook: boolean;
        prReport: boolean;
        prReportPublishTarget: string;
    };
}
