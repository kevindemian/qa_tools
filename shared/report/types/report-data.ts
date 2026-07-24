/**
 * Shared data contracts between compute and render layers.
 *
 * Every dashboard renderer receives a typed data object from the compute layer.
 * Renderers MUST NOT import from compute modules directly — only via these contracts.
 *
 * @module report-data
 */

/** A single HTML section within a dashboard. */
export interface SectionResult {
    title: string;
    content: string; // HTML fragment
}

/** Common shape for all dashboard renderers. */
export interface DashboardData {
    summaryCards: Array<{ label: string; value: string; severity?: string }>;
    sections: SectionResult[];
    timestamp: string;
}
