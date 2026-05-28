export type Framework = 'cypress' | 'playwright' | 'jest' | 'vitest' | 'generic';
export type GitProvider = 'github' | 'gitlab';

export interface SetupContext {
    projectName: string;
    framework: Framework;
    ctrfReportPath: string;
    nodeVersion: string;
    installCmd: string;
    testCmd: string;
    gitProvider: GitProvider;
    repoOwner: string;
    repoName: string;
    workflowDir: string;
    features: {
        jiraIntegration: boolean;
        flakinessDashboard: boolean;
        aiFailureAnalysis: boolean;
        prePushHook: boolean;
    };
}
