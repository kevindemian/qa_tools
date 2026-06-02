/**
 * Barrel export for all component primitives.
 *
 * @module primitives
 */

export { Container, Section, Grid, FlexRow, Separator } from './layout';
export type { ContainerProps, SectionProps, GridProps, FlexRowProps, SeparatorProps } from './layout';

export { Card, MetricCard, CardGrid, MetricGrid } from './card';
export type { CardProps, MetricCardProps, CardGridProps, MetricGridProps } from './card';

export { Badge, StatusBadge, SeverityBadge } from './badge';
export type { BadgeProps, StatusBadgeProps, SeverityBadgeProps } from './badge';

export { DataTable, THead, TBody, Tr, Td, Th } from './table';
export type { TableColumn, TableRow, DataTableProps, THeadProps, TBodyProps, TrProps, TdProps, ThProps } from './table';

export { BarChart, TrendChart, Sparkline, ProgressBar } from './chart';
export type { BarSegment, BarChartProps, TrendPoint, TrendChartProps, SparklineProps, ProgressBarProps } from './chart';

export { FilterBar, SearchInput, Button, ButtonGroup, Label } from './form';
export type { FilterBarProps, SearchInputProps, ButtonProps, ButtonGroupProps, LabelProps } from './form';
