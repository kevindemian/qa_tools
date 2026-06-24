import { WorkflowBuilder } from './workflow-builder.js';

describe('WorkflowBuilder', () => {
    it('builds an empty workflow for GitHub', () => {
        const b = new WorkflowBuilder('github', 'test');
        const yaml = b.toString();

        expect(yaml.trim()).toBe('{}');
    });

    it('sets workflow name and on events', () => {
        const b = new WorkflowBuilder('github', 'test');
        b.setWorkflowName('QA Pipeline');
        b.setOn(['push', 'pull_request']);
        const yaml = b.toString();

        expect(yaml).toContain('name: QA Pipeline');
        expect(yaml).toContain('on:');
        expect(yaml).toContain('push');
        expect(yaml).toContain('pull_request');
    });

    it('adds a GitHub job with steps', () => {
        const b = new WorkflowBuilder('github', 'test');
        b.addJob('qa', {
            runsOn: 'ubuntu-latest',
            steps: [{ uses: 'actions/checkout@v4' }, { name: 'Run tests', run: 'npm test' }],
        });
        const yaml = b.toString();

        expect(yaml).toContain('qa:');
        expect(yaml).toContain('runs-on: ubuntu-latest');
        expect(yaml).toContain('actions/checkout@v4');
        expect(yaml).toContain('npm test');
    });

    it('adds a GitLab job with script and stage', () => {
        const b = new WorkflowBuilder('gitlab', 'test');
        b.setStages(['test']);
        b.addJob('qa', {
            stage: 'test',
            image: 'node:20',
            script: ['npm ci', 'npm test'],
            artifacts: { paths: ['reports/ctrf.json'] },
        });
        const yaml = b.toString();

        expect(yaml).toContain('qa:');
        expect(yaml).toContain('stage: test');
        expect(yaml).toContain('image: node:20');
        expect(yaml).toContain('npm ci');
        expect(yaml).toContain('npm test');
        expect(yaml).toContain('paths:');
    });

    it('parses existing YAML and adds a job', () => {
        const existing = `name: CI
on: [push]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm lint
`;
        const b = new WorkflowBuilder('github', 'test');
        b.parseExisting(existing);

        expect(b.hasJob('lint')).toBeTruthy();
        expect(b.jobNames()).toContain('lint');
        expect(b.jobNames()).not.toContain('qa');

        b.addJob('qa', {
            runsOn: 'ubuntu-latest',
            needs: ['lint'],
            steps: [{ run: 'npm test' }],
        });

        expect(b.hasJob('qa')).toBeTruthy();

        const yaml = b.toString();

        expect(yaml).toContain('lint:');
        expect(yaml).toContain('qa:');
        expect(yaml).toContain('needs:');
        expect(yaml).toContain('lint');
    });

    it('removes a job', () => {
        const b = new WorkflowBuilder('github', 'test');
        b.addJob('qa', { runsOn: 'ubuntu-latest', steps: [{ run: 'echo hi' }] });

        expect(b.hasJob('qa')).toBeTruthy();

        b.removeJob('qa');

        expect(b.hasJob('qa')).toBeFalsy();
        expect(b.jobNames()).toStrictEqual([]);
    });

    it('supports env vars in GitHub steps', () => {
        const b = new WorkflowBuilder('github', 'test');
        b.addJob('qa', {
            runsOn: 'ubuntu-latest',
            steps: [{ run: 'echo $TOKEN', env: { TOKEN: '${{ secrets.TOKEN }}' } }],
        });
        const yaml = b.toString();

        expect(yaml).toContain('env:');
        expect(yaml).toContain('TOKEN');
    });

    it('supports services in GitHub jobs', () => {
        const b = new WorkflowBuilder('github', 'test');
        b.addJob('qa', {
            runsOn: 'ubuntu-latest',
            steps: [{ run: 'npm test' }],
            services: {
                postgres: { image: 'postgres:16', env: { POSTGRES_PASSWORD: 'pass' } },
            },
        });
        const yaml = b.toString();

        expect(yaml).toContain('services:');
        expect(yaml).toContain('postgres:');
        expect(yaml).toContain('image: postgres:16');
    });

    it('sets stages for GitLab', () => {
        const b = new WorkflowBuilder('gitlab', 'test');
        b.setStages(['build', 'test', 'deploy']);
        const yaml = b.toString();

        expect(yaml).toContain('stages:');
        expect(yaml).toContain('test');
        expect(yaml).toContain('deploy');
    });

    it('adds global variables for any provider', () => {
        const b = new WorkflowBuilder('github', 'test');
        b.addGlobalVariable('NODE_VERSION', '20');
        b.addGlobalVariable('CI', 'true');
        const yaml = b.toString();

        expect(yaml).toContain('NODE_VERSION');
        expect(yaml).toContain('CI');
    });

    it('handles invalid YAML in parseExisting gracefully', () => {
        const b = new WorkflowBuilder('github', 'test');
        b.parseExisting('{{{ not valid yaml }}}');

        expect(b.jobNames()).toStrictEqual([]);

        b.addJob('qa', { runsOn: 'ubuntu-latest', steps: [{ run: 'echo ok' }] });

        expect(b.hasJob('qa')).toBeTruthy();
    });
});
