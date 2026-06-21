/** @type {import('dependency-cruiser').IConfiguration} */
export default {
    forbidden: [
        // Layer restriction E5.1: shared/ must not import jira_management/ or git_triggers/
        {
            name: 'layer-shared-to-jira-git',
            comment: 'Layer violation [E5.1]: shared/ must not import from jira_management/ or git_triggers/',
            severity: 'error',
            from: {
                path: '^shared/',
                pathNot: ['^shared/test-utils/'],
            },
            to: { path: '^(jira_management|git_triggers)/' },
        },
        // Layer restriction E5.1: jira_management/ must not import git_triggers/
        {
            name: 'layer-jira-to-git',
            comment: 'Layer violation [E5.1]: jira_management/ must not import from git_triggers/',
            severity: 'error',
            from: { path: '^jira_management/' },
            to: { path: '^git_triggers/' },
        },
    ],

    options: {
        doNotFollow: {
            path: 'node_modules',
            dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg'],
        },

        exclude: {
            path: ['node_modules', '\\.git', 'coverage', 'dist', 'tests/fixtures'],
        },

        tsConfig: {
            fileName: 'tsconfig.json',
        },

        tsPreCompilationDeps: true,

        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default'],
            mainFields: ['main', 'types', 'typings'],
            extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
        },

        reporterOptions: {
            err: {},
            'err-long': {},
        },
    },
};
