/**
 * Barrel export for all component primitives.
 *
 * @module primitives
 */

export { Container, Section, Grid, FlexRow, Separator } from './layout.js';
export type { ContainerProps, SectionProps, GridProps, FlexRowProps, SeparatorProps } from './layout.js';

export { Card, MetricCard, CardGrid, MetricGrid } from './card.js';
export type { CardProps, MetricCardProps, CardGridProps, MetricGridProps } from './card.js';

export { Badge, StatusBadge, SeverityBadge } from './badge.js';
export type { BadgeProps, StatusBadgeProps, SeverityBadgeProps } from './badge.js';

export { DataTable, THead, TBody, Tr, Td, Th } from './table.js';
export type {
    TableColumn,
    TableRow,
    DataTableProps,
    THeadProps,
    TBodyProps,
    TrProps,
    TdProps,
    ThProps,
} from './table.js';

export { BarChart, TrendChart, Sparkline, ProgressBar } from './chart.js';
export type {
    BarSegment,
    BarChartProps,
    ChartPoint,
    TrendChartProps,
    SparklineProps,
    ProgressBarProps,
} from './chart.js';

export { FilterBar, SearchInput, Button, ButtonGroup, Label } from './form.js';
export type { FilterBarProps, SearchInputProps, ButtonProps, ButtonGroupProps, LabelProps } from './form.js';

export { EmptyState } from './empty-state.js';
export type { EmptyStateProps } from './empty-state.js';

export { RecommendedActions } from './recommended-actions.js';
export type { RecommendedActionsProps, RecommendedAction } from './recommended-actions.js';

export { buildHtmlPage, buildThemeScript, buildErrorPage } from './html-factory.js';
export type { HtmlPageParams } from './html-factory.js';

export { buildCss, buildCssVars, buildDarkVars } from './report-styles.js';

export {
    PRIORITY_WEIGHTS,
    getCoverageWeight,
    normalizeType,
    extractEpicKey,
    extractLinkedTestKeys,
    buildCoverageItems,
    calculateTotals,
    buildEpicRollup,
    getCoverageGateDefaults,
    checkQualityGate,
    loadEpicSummaries,
} from './coverage-utils.js';
export type { CoverageGapItem, CoverageGapResult, EpicCoverage } from '../types.js';
