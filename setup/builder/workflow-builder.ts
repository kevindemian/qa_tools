import { Document, type Node, YAMLMap, YAMLSeq, Scalar, Pair, isMap, parseDocument } from '../../shared/deps';

export interface StepConfig {
    name?: string;
    uses?: string;
    run?: string;
    with?: Record<string, string>;
    env?: Record<string, string>;
    if?: string;
}

export interface JobConfig {
    runsOn?: string;
    image?: string;
    stage?: string;
    needs?: string[];
    steps?: StepConfig[];
    script?: string[];
    artifacts?: {
        paths?: string[];
        reports?: Record<string, string[]>;
    };
    if?: string;
    environment?: Record<string, string>;
    services?: Record<string, { image: string; env?: Record<string, string> }>;
}

export class WorkflowBuilder {
    private doc: Document<Node>;
    private readonly provider: 'github' | 'gitlab';

    constructor(provider: 'github' | 'gitlab', _projectName: string) {
        this.provider = provider;
        const doc = new Document();
        doc.contents = new YAMLMap();
        this.doc = doc;
    }

    private root(): YAMLMap {
        if (!this.doc.contents) {
            this.doc.contents = new YAMLMap();
        }
        const contents = this.doc.contents;
        if (!isMap(contents)) {
            const m = new YAMLMap();
            this.doc.contents = m;
            return m;
        }
        return contents;
    }

    private jobsMap(): YAMLMap {
        const root = this.root();
        let jobs = root.get('jobs', true) as YAMLMap | undefined;
        if (!jobs) {
            jobs = new YAMLMap();
            root.set('jobs', jobs);
        }
        return jobs;
    }

    private findJob(name: string): YAMLMap | undefined {
        const jobs = this.jobsMap();
        for (const item of jobs.items) {
            const key = this.jobKey(item);
            if (key === name) {
                if (isMap(item.value)) return item.value;
            }
        }
        return undefined;
    }

    parseExisting(yamlContent: string): this {
        try {
            const parsed = parseDocument(yamlContent);
            if (parsed.contents && isMap(parsed.contents)) {
                this.doc = parsed;
            }
        } catch {
            // ignore parse errors — start fresh
        }
        return this;
    }

    private jobKey(item: Pair): string | undefined {
        if (item.key instanceof Scalar) return String(item.key.value);
        if (typeof item.key === 'string') return item.key;
        return undefined;
    }

    hasJob(name: string): boolean {
        return this.findJob(name) !== undefined;
    }

    jobNames(): string[] {
        const names: string[] = [];
        const jobs = this.jobsMap();
        for (const item of jobs.items) {
            const key = this.jobKey(item);
            if (key) names.push(key);
        }
        return names;
    }

    addJob(name: string, config: JobConfig): this {
        const jobs = this.jobsMap();
        const job = new YAMLMap();

        if (this.provider === 'github') {
            this._setupGitHubJob(job, config);
        } else {
            this._setupGitLabJob(job, config);
        }

        jobs.set(name, job);
        return this;
    }

    private _toScalarMap(record: Record<string, string>): YAMLMap {
        const map = new YAMLMap();
        for (const [k, v] of Object.entries(record)) {
            map.set(k, v);
        }
        return map;
    }

    private _addSteps(job: YAMLMap, steps: StepConfig[]): void {
        const stepsSeq = new YAMLSeq();
        for (const step of steps) {
            const stepNode = new YAMLMap();
            if (step.name) stepNode.set('name', step.name);
            if (step.uses) stepNode.set('uses', step.uses);
            if (step.run) stepNode.set('run', step.run);
            if (step.with) stepNode.set('with', this._toScalarMap(step.with));
            if (step.env) stepNode.set('env', this._toScalarMap(step.env));
            if (step.if) stepNode.set('if', step.if);
            stepsSeq.add(stepNode);
        }
        job.set('steps', stepsSeq);
    }

    private _addServices(
        job: YAMLMap,
        services: Record<string, { image: string; env?: Record<string, string> }>,
    ): void {
        const svcMap = new YAMLMap();
        for (const [name, svc] of Object.entries(services)) {
            const svcNode = new YAMLMap();
            svcNode.set('image', svc.image);
            if (svc.env) svcNode.set('env', this._toScalarMap(svc.env));
            svcMap.set(name, svcNode);
        }
        job.set('services', svcMap);
    }

    private _addStringSeq(job: YAMLMap, key: string, items: string[]): void {
        const seq = new YAMLSeq();
        for (const item of items) seq.add(item);
        job.set(key, seq);
    }

    private _setupGitHubJob(job: YAMLMap, config: JobConfig): void {
        if (config.runsOn) job.set('runs-on', config.runsOn);
        if (config.needs && config.needs.length > 0) this._addStringSeq(job, 'needs', config.needs);
        if (config.if) job.set('if', config.if);
        if (config.environment) job.set('environment', this._toScalarMap(config.environment));
        if (config.services) this._addServices(job, config.services);
        if (config.steps) this._addSteps(job, config.steps);
    }

    private _setupGitLabJob(job: YAMLMap, config: JobConfig): void {
        if (config.stage) job.set('stage', config.stage);
        if (config.image) job.set('image', config.image);
        if (config.needs && config.needs.length > 0) this._addStringSeq(job, 'needs', config.needs);
        if (config.script && config.script.length > 0) this._addStringSeq(job, 'script', config.script);
        if (config.if) job.set('rules', [{ if: config.if }]);
        if (config.artifacts) this._addGitLabArtifacts(job, config.artifacts);
        if (config.environment) job.set('variables', this._toScalarMap(config.environment));
    }

    private _addGitLabArtifacts(job: YAMLMap, artifacts: NonNullable<JobConfig['artifacts']>): void {
        const artMap = new YAMLMap();
        if (artifacts.paths) {
            const pathsSeq = new YAMLSeq();
            for (const p of artifacts.paths) pathsSeq.add(p);
            artMap.set('paths', pathsSeq);
        }
        if (artifacts.reports) {
            const rptMap = new YAMLMap();
            for (const [k, v] of Object.entries(artifacts.reports)) {
                const seq = new YAMLSeq();
                for (const item of v) seq.add(item);
                rptMap.set(k, seq);
            }
            artMap.set('reports', rptMap);
        }
        job.set('artifacts', artMap);
    }

    removeJob(name: string): this {
        const jobs = this.jobsMap();
        const idx = jobs.items.findIndex((item) => {
            const key = this.jobKey(item);
            return key === name;
        });
        if (idx >= 0) {
            jobs.items.splice(idx, 1);
        }
        return this;
    }

    toString(): string {
        return this.doc.toString();
    }

    setWorkflowName(name: string): this {
        this.root().set('name', name);
        return this;
    }

    setOn(events: string[]): this {
        const seq = new YAMLSeq();
        for (const e of events) seq.add(e);
        this.root().set('on', seq);
        return this;
    }

    setStages(stages: string[]): this {
        const seq = new YAMLSeq();
        for (const s of stages) seq.add(s);
        this.root().set('stages', seq);
        return this;
    }

    addGlobalVariable(key: string, value: string): this {
        let vars = this.root().get('variables', true) as YAMLMap | undefined;
        if (!vars) {
            vars = new YAMLMap();
            this.root().set('variables', vars);
        }
        vars.set(key, value);
        return this;
    }
}
