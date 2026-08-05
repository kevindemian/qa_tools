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

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL_DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Create an empty category counter bucket. A Map has no prototype chain, so a
 * category name such as '__proto__' can never resolve to a prototype accessor
 * (prototype-pollution guard — Map.get/set is fully safe).
 */
function createBucket(): Map<string, number> {
    return new Map<string, number>();
}

/**
 * Extract a YYYY-MM-DD date from a timestamp, or 'Unknown' for records that
 * cannot be placed on a temporal axis. Grouping under 'Unknown' (rather than
 * discarding) preserves visibility of every failure record (Rule 25 — no silent
 * data loss).
 */
function extractDate(timestamp: string): string {
    if (!timestamp || typeof timestamp !== 'string' || timestamp.length < 10) return 'Unknown';
    const datePart = timestamp.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return 'Unknown';
    return datePart;
}

function updateMinMax(date: string, currentMin: string, currentMax: string): { min: string; max: string } {
    return {
        min: date < currentMin ? date : currentMin,
        max: date > currentMax ? date : currentMax,
    };
}

function addToCategoryMap(map: Map<string, Map<string, number>>, key: string, category: string): void {
    const existing = map.get(key);
    const bucket = existing ?? createBucket();
    const current = bucket.get(category);
    bucket.set(category, (typeof current === 'number' && Number.isFinite(current) ? current : 0) + 1);
    map.set(key, bucket);
}

function mapToDayArray(map: Map<string, Map<string, number>>): SeasonalityDay[] {
    return DAY_ORDER.map((d) => {
        const cats = map.get(d) ?? createBucket();
        return {
            dayOfWeek: d,
            total: [...cats.values()].reduce((s, v) => s + v, 0),
            categories: mapToCategoryCounts(cats),
        };
    });
}

function mapToHourArray(map: Map<number, Map<string, number>>): SeasonalityHour[] {
    return Array.from({ length: 24 }, (_, i) => {
        const cats = map.get(i) ?? createBucket();
        return {
            hour: i,
            total: [...cats.values()].reduce((s, v) => s + v, 0),
            categories: mapToCategoryCounts(cats),
        };
    });
}

function mapToCategoryCounts(cats: Map<string, number>): Record<string, number> {
    return Object.fromEntries(cats);
}

function findPeakDay(days: SeasonalityDay[]): string {
    let maxTotal = 0;
    let peak = 'N/A';
    for (const d of days) {
        if (d.dayOfWeek === 'Unknown') continue;
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
export function aggregateDefectTrends(records: FailureClassification[] | null | undefined): DefectAggregationResult {
    if (!records || records.length === 0) {
        return { trends: [], topCategories: [], period: { from: '', to: '' }, totalRecords: 0 };
    }

    const dailyMap = new Map<string, Map<string, number>>();
    const categoryTotals = new Map<string, number>();
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';
    let hasValidDate = false;

    for (const record of records) {
        const date = extractDate(record.timestamp);
        const category = record.category;
        addToCategoryMap(dailyMap, date, category);
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + 1);
        if (date !== 'Unknown') {
            const range = updateMinMax(date, minDate, maxDate);
            minDate = range.min;
            maxDate = range.max;
            hasValidDate = true;
        }
    }

    const trends: DefectTrendPoint[] = [...dailyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, categories]) => ({
            date,
            categories: mapToCategoryCounts(categories),
            total: [...categories.values()].reduce((s, v) => s + v, 0),
        }));

    const topCategories = [...categoryTotals.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([category, count]) => ({ category, count }));

    return {
        trends,
        topCategories,
        period: hasValidDate ? { from: minDate, to: maxDate } : { from: '', to: '' },
        totalRecords: records.length,
    };
}

/**
 * Aggregate failure classifications into seasonality patterns.
 *
 * @param records - FailureClassification[] from DataHub.
 * @returns SeasonalityAggregationResult with day-of-week and hour-of-day breakdowns.
 */
export function aggregateDefectSeasonality(
    records: FailureClassification[] | null | undefined,
): SeasonalityAggregationResult {
    if (!records || records.length === 0) {
        return {
            byDayOfWeek: DAY_ORDER.map((d) => ({ dayOfWeek: d, total: 0, categories: {} })),
            byHour: Array.from({ length: 24 }, (_, i) => ({ hour: i, total: 0, categories: {} })),
            peakDay: 'N/A',
            peakHour: -1,
            totalRecords: 0,
            period: { from: '', to: '' },
            timestamp: new Date().toISOString(),
        };
    }

    const dayMap = new Map<string, Map<string, number>>();
    const hourMap = new Map<number, Map<string, number>>();
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';
    let hasValidDate = false;
    let hasUnknown = false;

    for (const d of DAY_ORDER) dayMap.set(d, createBucket());
    for (let h = 0; h < 24; h++) hourMap.set(h, createBucket());

    for (const record of records) {
        const date = extractDate(record.timestamp);
        const ts = new Date(record.timestamp);
        const tsValid = Number.isFinite(ts.getTime());
        const category = record.category;

        if (tsValid && date !== 'Unknown') {
            const range = updateMinMax(date, minDate, maxDate);
            minDate = range.min;
            maxDate = range.max;
            hasValidDate = true;
        }

        if (tsValid) {
            const dayOfWeek = FULL_DAY_ORDER[ts.getUTCDay()] ?? 'Unknown';
            const hour = ts.getUTCHours();
            addToCategoryMap(dayMap, dayOfWeek, category);
            const hourBucket = hourMap.get(hour);
            if (hourBucket) hourBucket.set(category, (hourBucket.get(category) ?? 0) + 1);
        } else {
            // Rule 25: records with unparseable timestamps are surfaced under
            // 'Unknown' on the day axis (no hour axis) instead of being silently
            // dropped. totalRecords keeps counting them (explicit, no masking).
            addToCategoryMap(dayMap, 'Unknown', category);
            hasUnknown = true;
        }
    }

    const byDayOfWeek = mapToDayArray(dayMap);
    if (hasUnknown) {
        const unknownCats = dayMap.get('Unknown') ?? createBucket();
        byDayOfWeek.push({
            dayOfWeek: 'Unknown',
            total: [...unknownCats.values()].reduce((s, v) => s + v, 0),
            categories: mapToCategoryCounts(unknownCats),
        });
    }
    const byHour = mapToHourArray(hourMap);

    return {
        byDayOfWeek,
        byHour,
        peakDay: findPeakDay(byDayOfWeek),
        peakHour: findPeakHour(byHour),
        totalRecords: records.length,
        period: hasValidDate ? { from: minDate, to: maxDate } : { from: '', to: '' },
        timestamp: new Date().toISOString(),
    };
}
