import { describe, it, expect } from 'vitest';
import type { FlakyResult } from '../../../types/data-hub.js';
import { calcQuarantineStatus } from '../../compute/quarantine-status.js';
import type { QuarantineConfig } from '../../compute/types.js';

const config: QuarantineConfig = { minRuns: 3, quarantineThreshold: 30 };

describe('Compute/quarantine-status', () => {
    it('returns zero counts for empty flaky results', () => {
        expect.hasAssertions();
        expect(calcQuarantineStatus([], config)).toStrictEqual({ flakyCount: 0, quarantinedCount: 0 });
    });

    it('quarantines test above threshold', () => {
        expect.hasAssertions();

        const flaky: FlakyResult[] = [{ title: 'flaky-test', rate: 50, runs: 10 }];

        expect(calcQuarantineStatus(flaky, config)).toStrictEqual({ flakyCount: 1, quarantinedCount: 1 });
    });

    it('does not quarantine test below threshold', () => {
        expect.hasAssertions();

        const flaky: FlakyResult[] = [{ title: 'mild-flaky', rate: 20, runs: 10 }];

        expect(calcQuarantineStatus(flaky, config)).toStrictEqual({ flakyCount: 1, quarantinedCount: 0 });
    });

    it('quarantines at exact threshold', () => {
        expect.hasAssertions();

        const flaky: FlakyResult[] = [{ title: 'exact', rate: 30, runs: 10 }];

        expect(calcQuarantineStatus(flaky, config)).toStrictEqual({ flakyCount: 1, quarantinedCount: 1 });
    });

    it('handles mixed quarantine recommendations', () => {
        expect.hasAssertions();

        const flaky: FlakyResult[] = [
            { title: 'high', rate: 80, runs: 10 },
            { title: 'low', rate: 10, runs: 10 },
            { title: 'mid', rate: 30, runs: 10 },
        ];

        expect(calcQuarantineStatus(flaky, config)).toStrictEqual({ flakyCount: 3, quarantinedCount: 2 });
    });
});
