import type Config from '../config-accessor.js';
import type { StateSchema } from '../types.js';

export const migrateOldState = vi.fn<(config?: Config) => void>();

export const getStatePath = vi.fn<(config?: Config) => string>().mockReturnValue('/mock/state.json');

export const loadTypedState = vi.fn<(config?: Config) => StateSchema>(() => ({}));

export const load = vi.fn<(config?: Config) => Record<string, unknown>>().mockReturnValue({});

export const save = vi.fn<(state: Record<string, unknown>, config?: Config) => void>();

export const update = vi.fn(
    (fn: (state: Record<string, unknown>) => void, _config?: Config): Record<string, unknown> => {
        const copy: Record<string, unknown> = {};
        fn(copy);
        return copy;
    },
);
