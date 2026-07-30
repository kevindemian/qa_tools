/**
 * Compute: Defect Aggregation.
 *
 * Aggregates failure data by category, day-of-week, and hour-of-day.
 * Feeds both defect-trend and defect-seasonality dashboards.
 *
 * SSOT: All aggregation happens here. Renderers consume the result directly.
 */
import type { FailureClassification } from '../../types/data-hub.js';
import type {
    DefectAggregationResult,
    SeasonalityAggregationResult,
    DefectTrendPoint,
    SeasonalityDay,
    SeasonalityHour,
} from '../../types/data-hub-extensions.js';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FULL_DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

function extractDate(timestamp: string): string | undefined {
    const match = DATE_PATTERN.exec(timestamp);
    return match?.[1];
}

function updateMinMax(date: string, currentMin: string, currentMax: string): { min: string; max: string } {
    return {
        min: date < currentMin ? date : currentMin,
        max: date > currentMax ? date : currentMax,
    };
}

function addToCategoryMap(map: Map<string, Record<string, number>>, key: string, category: string): void {
    let bucket = map.get(key);
    if (!bucket) {
        bucket = {};
        map.set(key, bucket);
    }
    bucket[category] = (bucket[category] ?? 0) + 1;
}

function mapToDayArray(map: Map<string, Record<string, number>>): SeasonalityDay[] {
    return DAY_ORDER.map((d) => {
        const cats = map.get(d) ?? {};
        return { dayOfWeek: d, total: Object.values(cats).reduce((s, v) => s + v, 0), categories: cats };
    });
}

function mapToHourArray(map: Map<number, Record<string, number>>): SeasonalityHour[] {
    return Array.from({ length: 24 }, (_, i) => {
        const cats = map.get(i) ?? {};
        return { hour: i, total: Object.values(cats).reduce((s, v) => s + v, 0), categories: cats };
    });
}

function findPeakDay(days: SeasonalityDay[]): string {
    let maxTotal = 0;
    let peak = '';
    for (const d of days) {
        if (d.total > maxTotal) {
            maxTotal = d.total;
            peak = d.dayOfWeek;
        }
    }
    return peak;
}

function findPeakHour(hours: SeasonalityHour[]): number {
    let maxTotal = 0;
    let peak = -1;
    for (const h of hours) {
        if (h.total > maxTotal) {
            maxTotal = h.total;
            peak = h.hour;
        }
    }
    return peak;
}

/**
 * Aggregate failure classifications into daily defect trends.
 *
 * @param records - FailureClassification[] from DataHub.
 * @returns DefectAggregationResult with daily trends and top categories.
 */
export function aggregateDefectTrends(records: FailureClassification[]): DefectAggregationResult {
    if (records.length === 0) {
        return { trends: [], topCategories: [], period: { from: '', to: '' }, totalRecords: 0 };
    }

    const dailyMap = new Map<string, Record<string, number>>();
    const categoryTotals = new Map<string, number>();
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';

    for (const record of records) {
        const date = extractDate(record.timestamp);
        if (!date) continue;
        const range = updateMinMax(date, minDate, maxDate);
        minDate = range.min;
        maxDate = range.max;

        const category = record.category;
        addToCategoryMap(dailyMap, date, category);
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + 1);
    }

    const trends: DefectTrendPoint[] = [...dailyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, categories]) => ({
            date,
            categories,
            total: Object.values(categories).reduce((s, v) => s + v, 0),
        }));

    const topCategories = [...categoryTotals.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([category, count]) => ({ category, count }));

    return { trends, topCategories, period: { from: minDate, to: maxDate }, totalRecords: records.length };
}

/**
 * Aggregate failure classifications into seasonality patterns.
 *
 * @param records - FailureClassification[] from DataHub.
 * @returns SeasonalityAggregationResult with day-of-week and hour-of-day breakdowns.
 */
export function aggregateDefectSeasonality(records: FailureClassification[]): SeasonalityAggregationResult {
    if (records.length === 0) {
        return {
            byDayOfWeek: DAY_ORDER.map((d) => ({ dayOfWeek: d, total: 0, categories: {} })),
            byHour: Array.from({ length: 24 }, (_, i) => ({ hour: i, total: 0, categories: {} })),
            peakDay: '',
            peakHour: -1,
            totalRecords: 0,
            period: { from: '', to: '' },
        };
    }

    const dayMap = new Map<string, Record<string, number>>();
    const hourMap = new Map<number, Record<string, number>>();
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';

    for (const d of DAY_ORDER) dayMap.set(d, {});
    for (let h = 0; h < 24; h++) hourMap.set(h, {});

    for (const record of records) {
        const date = extractDate(record.timestamp);
        if (!date) continue;
        const range = updateMinMax(date, minDate, maxDate);
        minDate = range.min;
        maxDate = range.max;

        const ts = new Date(record.timestamp);
        if (!Number.isFinite(ts.getTime())) continue;

        const dayOfWeek = FULL_DAY_ORDER[ts.getUTCDay()] ?? 'Unknown';
        const hour = ts.getUTCHours();
        const category = record.category;

        addToCategoryMap(dayMap, dayOfWeek, category);
        const hourBucket = hourMap.get(hour);
        if (hourBucket) hourBucket[category] = (hourBucket[category] ?? 0) + 1;
    }

    const byDayOfWeek = mapToDayArray(dayMap);
    const byHour = mapToHourArray(hourMap);

    return {
        byDayOfWeek,
        byHour,
        peakDay: findPeakDay(byDayOfWeek),
        peakHour: findPeakHour(byHour),
        totalRecords: records.length,
        period: { from: minDate, to: maxDate },
    };
}
