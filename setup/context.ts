export type Framework = 'cypress' | 'playwright' | 'jest' | 'vitest' | 'generic';
export type GitProvider = 'github' | 'gitlab';

/**
 * Describes how the project generates test reports.
 * - 'config-file': CTRF reporter is configured in vitest.config.ts/vite.config.ts (project already has it)
 * - 'cli-flag': CTRF reporter is added via --reporter CLI flag (framework default)
 * - 'missing': No CTRF reporter detected; wizard should suggest installation
 */
export type CtrfSource = 'config-file' | 'cli-flag' | 'missing';

export interface SetupContext {
    projectName: string;
    framework: Framework;
    /** Path to test report files (CTRF/JUnit/Mochawesome). Used by ci-injector for artifact upload. */
    testReportPath: string;
    /** Name of the artifact to upload test reports as. DataHub uses this to find artifacts. */
    artifactName: string;
    /** @deprecated Use testReportPath instead. Kept for backward compatibility during migration. */
    ctrfReportPath: string;
    ctrfSource: CtrfSource;
    nodeVersion: string;
    installCmd: string;
    testCmd: string;
    gitProvider: GitProvider;
    repoOwner: string;
    repoName: string;
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
