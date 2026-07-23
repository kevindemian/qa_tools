/**
 * Case18 Quality Evaluator — Engine principal
 *
 * Avalia qualidade de test cases gerados por IA (case18).
 * Camada 1: Deterministic (rule-based) — sempre executa
 * Camada 2: LLM-as-Judge (opcional, reliability-gated) — futuro
 * Camada 3: Human Calibration (opcional) — futuro
 *
 * Referência: Project Kaleidoscope (arXiv:2607.14673)
 */
import type { GeneratedTestCase, EvaluationResult } from './case18-types.js';
import { evaluateDeterministic } from './case18-deterministic.js';

/** Grade boundaries (Kaleidoscope-inspired). */
const GRADE_THRESHOLDS = [
    { min: 90, grade: 'A' as const },
    { min: 75, grade: 'B' as const },
    { min: 60, grade: 'C' as const },
    { min: 40, grade: 'D' as const },
    { min: 0, grade: 'F' as const },
];

function determineGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    for (const t of GRADE_THRESHOLDS) {
        if (score >= t.min) return t.grade;
    }
    return 'F';
}

/**
 * Evaluate AI-generated test cases for quality.
 *
 * @param testCases - LLM-generated test cases (from case18)
 * @param acceptanceCriteria - Raw acceptance criteria text from user story
 * @param options - Configuration options
 * @returns Evaluation result with score, grade, and per-metric breakdown
 */
export function evaluateCase18(
    testCases: GeneratedTestCase[],
    acceptanceCriteria: string,
    _options?: { useLLMJudge?: boolean },
): EvaluationResult {
    // Layer 1: Deterministic (always runs)
    const deterministic = evaluateDeterministic(testCases, acceptanceCriteria);

    // Collect all pass/fail/warning details
    const passed: string[] = [];
    const failed: string[] = [];
    const warnings: string[] = [];

    for (const [key, metric] of Object.entries(deterministic.metrics)) {
        for (const p of metric.passed) {
            passed.push(`[${key}] ${p}`);
        }
        for (const f of metric.failed) {
            failed.push(`[${key}] ${f}`);
        }
        for (const w of metric.warnings) {
            warnings.push(`[${key}] ${w}`);
        }
    }

    const score = deterministic.score;
    const grade = determineGrade(score);

    return {
        score,
        grade,
        layers: { deterministic },
        details: { passed, failed, warnings },
    };
}

/**
 * Generate HTML report for evaluation result.
 *
 * @param result - Evaluation result from evaluateCase18
 * @param userStory - Original user story (for context)
 * @returns HTML string
 */
export function generateEvaluationReport(result: EvaluationResult, _userStory?: string): string {
    const { score, grade, layers, details } = result;
    const d = layers.deterministic;

    const gradeColors: Record<string, string> = {
        A: '#22c55e',
        B: '#84cc16',
        C: '#eab308',
        D: '#f97316',
        F: '#ef4444',
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Case18 Quality Evaluation</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  .header { text-align: center; margin-bottom: 30px; }
  .score-circle { width: 120px; height: 120px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 36px; font-weight: bold; color: white; }
  .grade-badge { font-size: 48px; font-weight: bold; margin-left: 20px; }
  .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 30px 0; }
  .metric-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
  .metric-card h3 { margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; }
  .metric-score { font-size: 28px; font-weight: bold; }
  .bar { height: 8px; background: #e5e7eb; border-radius: 4px; margin-top: 8px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .details { margin-top: 30px; }
  .details h2 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  .pass { color: #22c55e; }
  .fail { color: #ef4444; }
  .warn { color: #eab308; }
  ul { list-style: none; padding: 0; }
  li { padding: 4px 0; }
  li::before { content: '•'; margin-right: 8px; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
</style>
</head>
<body>
<div class="header">
  <div class="score-circle" style="background: ${gradeColors[grade]}">${score}</div>
  <span class="grade-badge" style="color: ${gradeColors[grade]}">${grade}</span>
  <p style="color: #6b7280; margin-top: 10px">${d.details.totalTests} test cases evaluated</p>
</div>

<div class="metrics">
  ${Object.entries(d.metrics)
      .map(
          ([key, m]) => `
  <div class="metric-card">
    <h3>${key.replace(/([A-Z])/g, ' $1').trim()}</h3>
    <div class="metric-score" style="color: ${m.score >= 75 ? '#22c55e' : m.score >= 50 ? '#eab308' : '#ef4444'}">${m.score}%</div>
    <div class="bar"><div class="bar-fill" style="width: ${m.score}%; background: ${m.score >= 75 ? '#22c55e' : m.score >= 50 ? '#eab308' : '#ef4444'}"></div></div>
  </div>`,
      )
      .join('\n')}
</div>

<div class="details">
  <h2>Passed (${details.passed.length})</h2>
  <ul>${details.passed.map((p) => `<li class="pass">${p}</li>`).join('\n')}</ul>

  <h2>Failed (${details.failed.length})</h2>
  <ul>${details.failed.map((f) => `<li class="fail">${f}</li>`).join('\n')}</ul>

  <h2>Warnings (${details.warnings.length})</h2>
  <ul>${details.warnings.map((w) => `<li class="warn">${w}</li>`).join('\n')}</ul>
</div>

<div class="footer">
  <p>Case18 Quality Evaluator — Deterministic Layer (v1.0)</p>
  <p>Based on Project Kaleidoscope (arXiv:2607.14673) and ISTQB CTFL</p>
</div>
</body>
</html>`;
}
