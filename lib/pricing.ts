// Single source of truth for Claude model pricing (USD per 1M tokens).
// All sections/routes import from here so rates can never drift.
type ModelTier = "opus" | "sonnet" | "haiku";

export interface ModelRates {
    input: number;
    output: number;
    cache_read: number;
    cache_write_5m: number; // 5-minute ephemeral cache write (the default cache_creation)
    cache_write_1h: number; // 1-hour ephemeral cache write
}

const MODEL_RATES: Record<ModelTier, ModelRates> = {
    opus:   { input: 15, output: 75, cache_read: 1.50, cache_write_5m: 18.75, cache_write_1h: 30 },
    sonnet: { input: 3,  output: 15, cache_read: 0.30, cache_write_5m: 3.75,  cache_write_1h: 6  },
    haiku:  { input: 1,  output: 5,  cache_read: 0.10, cache_write_5m: 1.25,  cache_write_1h: 2  },
};

function getModelTier(model?: string): ModelTier {
    const m = (model || "").toLowerCase();
    if (m.includes("opus")) return "opus";
    if (m.includes("haiku")) return "haiku";
    return "sonnet";
}

export function getModelRates(model?: string): ModelRates {
    return MODEL_RATES[getModelTier(model)];
}
