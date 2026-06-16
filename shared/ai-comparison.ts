/**
 * AI Test Effectiveness Comparison — compares AI-generated tests vs manually-written tests
 * to answer "Are AI-generated tests better?"
 *
 * @module ai-comparison
 */

import { sanitizeHtml } from './escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { rootLogger } from './logger.js';
import { MetricCard, MetricGrid, Badge, DataTable } from './primitives/index.js';
import type { TableColumn, TableRow } from './primitives/index.js';

export interface AiComparisonRecord {
    testTitle: string;
    generatedBy: 'ai' | 'manual';
    accepted: boolean;
    passed: boolean;
    duration: number;
    flakiness: number;
    promptVersion: string;
    modificationReason?: string;
}

export interface AiComparisonResult {
    aiTotal: number;
    aiPassRate: number;
    aiFlakinessAvg: number;
    aiAcceptanceRate: number;
    manualTotal: number;
    manualPassRate: number;
    manualFlakinessAvg: number;
    manualAcceptanceRate: number;
    aiAdvantage: 'pass_rate' | 'flakiness' | 'none';
    byVersion: Array<{ version: string; count: number; passRate: number }>;
    timestamp: string;
}

export function compareAiVsManual(records: AiComparisonRecord[]): AiComparisonResult {
    const timestamp = new Date().toISOString();

    if (records.length === 0) {
        return {
            aiTotal: 0,
            aiPassRate: 0,
            aiFlakinessAvg: 0,
            aiAcceptanceRate: 0,
            manualTotal: 0,
            manualPassRate: 0,
            manualFlakinessAvg: 0,
            manualAcceptanceRate: 1,
            aiAdvantage: 'none',
            byVersion: [],
            timestamp,
        };
    }

    const aiRecords = records.filter((r) => r.generatedBy === 'ai');
    const manualRecords = records.filter((r) => r.generatedBy === 'manual');

    const aiTotal = aiRecords.length;
    const aiPassed = aiRecords.filter((r) => r.passed).length;
    const aiPassRate = aiTotal > 0 ? Math.round((aiPassed / aiTotal) * 100) : 0;
    const aiFlakinessAvg = aiTotal > 0 ? aiRecords.reduce((s, r) => s + r.flakiness, 0) / aiTotal : 0;
    const aiAccepted = aiRecords.filter((r) => r.accepted).length;
    const aiAcceptanceRate = aiTotal > 0 ? aiAccepted / aiTotal : 0;

    const manualTotal = manualRecords.length;
    const manualPassed = manualRecords.filter((r) => r.passed).length;
    const manualPassRate = manualTotal > 0 ? Math.round((manualPassed / manualTotal) * 100) : 0;
    const manualFlakinessAvg = manualTotal > 0 ? manualRecords.reduce((s, r) => s + r.flakiness, 0) / manualTotal : 0;
    const manualAcceptanceRate = 1;

    let aiAdvantage: 'pass_rate' | 'flakiness' | 'none' = 'none';
    if (aiTotal > 0 && manualTotal > 0) {
        if (aiPassRate > manualPassRate) {
            aiAdvantage = 'pass_rate';
        } else if (aiFlakinessAvg < manualFlakinessAvg) {
            aiAdvantage = 'flakiness';
        }
    }

    const versionMap = new Map<string, { count: number; passed: number }>();
    for (const r of aiRecords) {
        const v = r.promptVersion || 'unknown';
        const entry = versionMap.get(v) ?? { count: 0, passed: 0 };
        entry.count++;
        if (r.passed) entry.passed++;
        versionMap.set(v, entry);
    }

    const byVersion: Array<{ version: string; count: number; passRate: number }> = [];
    for (const [version, data] of versionMap) {
        byVersion.push({
            version,
            count: data.count,
            passRate: Math.round((data.passed / data.count) * 100),
        });
    }

    return {
        aiTotal,
        aiPassRate,
        aiFlakinessAvg,
        aiAcceptanceRate,
        manualTotal,
        manualPassRate,
        manualFlakinessAvg,
        manualAcceptanceRate,
        aiAdvantage,
        byVersion,
        timestamp,
    };
}

function buildComparisonCards(result: AiComparisonResult): string {
    return MetricGrid({
        children:
            MetricCard({ label: 'AI Pass Rate', value: `${result.aiPassRate}%` }) +
            MetricCard({ label: 'Manual Pass Rate', value: `${result.manualPassRate}%` }) +
            MetricCard({ label: 'AI Avg Flakiness', value: result.aiFlakinessAvg.toFixed(3) }) +
            MetricCard({ label: 'Manual Avg Flakiness', value: result.manualFlakinessAvg.toFixed(3) }) +
            MetricCard({ label: 'AI Acceptance', value: result.aiAcceptanceRate.toFixed(2) }) +
            MetricCard({ label: 'Manual Acceptance', value: '1.00' }),
    });
}

function buildAdvantageSection(result: AiComparisonResult): string {
    let badgeHtml: string;
    let description: string;

    if (result.aiTotal === 0 || result.manualTotal === 0) {
        badgeHtml = Badge({ variant: 'default', children: 'N/A' });
        description = 'Both AI and manual test data required for comparison.';
    } else if (result.aiAdvantage === 'pass_rate') {
        badgeHtml = Badge({ variant: 'pass', children: 'Pass Rate' });
        description = `AI-generated tests pass at a higher rate (${result.aiPassRate}% vs ${result.manualPassRate}%).`;
    } else if (result.aiAdvantage === 'flakiness') {
        badgeHtml = Badge({ variant: 'info', children: 'Flakiness' });
        description = `AI-generated tests are less flaky (${result.aiFlakinessAvg.toFixed(3)} vs ${result.manualFlakinessAvg.toFixed(3)}).`;
    } else {
        badgeHtml = Badge({ variant: 'default', children: 'None' });
        description = 'AI-generated tests show no clear advantage over manual tests.';
    }

    return `<h2>AI Advantage</h2><p>${badgeHtml} — ${sanitizeHtml(description)}</p>`;
}

function buildVersionTable(result: AiComparisonResult): string {
    if (result.byVersion.length === 0) return '';

    const columns: TableColumn[] = [
        { key: 'version', label: 'Prompt Version' },
        { key: 'count', label: 'Tests', align: 'right' },
        { key: 'passRate', label: 'Pass Rate', align: 'right' },
    ];

    const rows: TableRow[] = result.byVersion.map((v) => ({
        key: sanitizeHtml(v.version),
        cells: {
            version: sanitizeHtml(v.version),
            count: String(v.count),
            passRate: `${v.passRate}%`,
        },
    }));

    return `<h2>Version Breakdown</h2>${DataTable({ columns, rows })}`;
}

export function generateAiComparisonHtml(result: AiComparisonResult, title?: string): string {
    try {
        const pageTitle = title || 'AI vs Manual Test Comparison';

        let bodyContent = `<h1>${sanitizeHtml(pageTitle)}</h1>`;

        if (result.aiTotal === 0 && result.manualTotal === 0) {
            bodyContent += '<p>No comparison data available.</p>';
        } else {
            bodyContent += '<h2>Comparison Overview</h2>';
            bodyContent += buildComparisonCards(result);
            bodyContent += buildAdvantageSection(result);
            bodyContent += buildVersionTable(result);
        }

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
            footer: `Generated by QA Tools — ${pageTitle}`,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Failed to generate AI comparison dashboard: ' + msg);
        return buildErrorPage('Error generating dashboard', 'Error generating dashboard');
    }
}
