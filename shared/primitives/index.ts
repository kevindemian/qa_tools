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
    TrendPoint,
    TrendChartProps,
    SparklineProps,
    ProgressBarProps,
} from './chart.js';

export { FilterBar, SearchInput, Button, ButtonGroup, Label } from './form.js';
export type { FilterBarProps, SearchInputProps, ButtonProps, ButtonGroupProps, LabelProps } from './form.js';
