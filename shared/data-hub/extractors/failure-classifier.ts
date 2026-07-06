export interface CheckRunAnnotation {
    path: string;
    start_line: number;
    end_line: number;
    message: string;
    annotation_level: string;
}

export interface StepConclusion {
    name: string;
    conclusion: string;
    number: number;
}

export interface FailureEntry {
    stepName?: string;
    reason?: string;
    message?: string;
    file?: string;
    line?: number;
}

export interface FailureInput {
    gitlabFailureReason?: string;
    githubSteps?: StepConclusion[];
    checkRunAnnotations?: CheckRunAnnotation[];
    logText?: string;
}

function fromGitlab(reason: string): FailureEntry[] {
    return [{ reason }];
}

function fromSteps(steps: StepConclusion[]): FailureEntry[] {
    return steps
        .filter((s) => s.conclusion === 'failure')
        .map((s) => ({
            stepName: s.name,
            reason: s.conclusion,
        }));
}

function fromAnnotations(annotations: CheckRunAnnotation[]): FailureEntry[] {
    return annotations
        .filter((a) => a.annotation_level === 'failure')
        .map((a) => ({
            message: a.message,
            file: a.path,
            line: a.start_line,
        }));
}

function fromLog(text: string): FailureEntry[] {
    const failures: FailureEntry[] = [];
    const seen = new Set<string>();

    const patterns = [/Error[:\s]+(.{10,200})/g, /Failure[:\s]+(.{10,200})/g];

    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const group = match[1];
            if (!group) continue;
            const msg = group.trim();
            if (msg && msg.length >= 10 && !seen.has(msg)) {
                seen.add(msg);
                failures.push({ message: msg });
            }
        }
    }

    return failures;
}

export function classifyFailures(input: FailureInput): FailureEntry[] {
    if (input.gitlabFailureReason !== undefined) {
        return fromGitlab(input.gitlabFailureReason);
    }
    if (input.githubSteps && input.githubSteps.length > 0) {
        const result = fromSteps(input.githubSteps);
        if (result.length > 0) return result;
    }
    if (input.checkRunAnnotations && input.checkRunAnnotations.length > 0) {
        const result = fromAnnotations(input.checkRunAnnotations);
        if (result.length > 0) return result;
    }
    if (input.logText) {
        const result = fromLog(input.logText);
        if (result.length > 0) return result;
    }
    return [];
}
