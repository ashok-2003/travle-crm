// What the AI costs (the owner, 2026-11-02): the models' published prices in US dollars per million tokens, as Google's
// pricing page gives them on 2026-11-02 (https://ai.google.dev/gemini-api/docs/pricing, the paid tier, not batch), with
// a change it announces from its date; rupees at the console's rate. A model not listed here falls back to the
// console's AI_PRICE_* settings, else counts nothing and is shown as unpriced. Thinking tokens are output tokens.
import type { AiModelPrice } from "@travel-crm/contracts/platform";
import type { AiPrices } from "./services.js";

interface PricePeriod {
  /** The first day, yyyy-mm-dd (UTC), or none for "always". */
  from?: string;
  input: number;
  output: number;
}

const PUBLISHED: Readonly<Record<string, readonly PricePeriod[]>> = {
  "gemini-3.8-flash": [
    { input: 0.75, output: 3.75 },
    { from: "2027-01-01", input: 1.5, output: 7.5 },
  ],
  "gemini-3.5-flash-lite": [{ input: 0.3, output: 2.5 }],
};

/** "models/gemini-3.5-flash-lite-001" or "google/gemini-3.8-flash" → the listed model it is, or null. */
function listedModel(model: string): string | null {
  const name = model.toLowerCase().replace(/^(models|google)\//, "");
  const listed = Object.keys(PUBLISHED)
    .filter((key) => name === key || name.startsWith(`${key}-`))
    .sort((a, b) => b.length - a.length);
  return listed[0] ?? null;
}

function periodOn(periods: readonly PricePeriod[], day: string): PricePeriod | undefined {
  return periods.filter((period) => period.from === undefined || period.from <= day).at(-1);
}

export interface AiPricing {
  usdInrRate: number;
  /** The cost in paise of these tokens of this model on this day (yyyy-mm-dd), or null when its price is unknown. */
  costPaise(model: string, day: string, tokens: { input: number; output: number }): number | null;
  /** The listed prices on this day, with the next change of each. */
  table(day: string): AiModelPrice[];
}

export function aiPricing(usdInrRate: number, fallback: AiPrices | null): AiPricing {
  return {
    usdInrRate,
    costPaise(model, day, tokens) {
      const listed = listedModel(model);
      const period = listed === null ? undefined : periodOn(PUBLISHED[listed] ?? [], day);
      if (period !== undefined) {
        const usd = (tokens.input * period.input + tokens.output * period.output) / 1_000_000;
        return Math.round(usd * usdInrRate * 100);
      }
      if (fallback === null || model === "") return null;
      return Math.round(
        (tokens.input * fallback.inputPaisePerMillion + tokens.output * fallback.outputPaisePerMillion) / 1_000_000,
      );
    },
    table(day) {
      return Object.entries(PUBLISHED).flatMap(([model, periods]) => {
        const now = periodOn(periods, day);
        if (now === undefined) return [];
        const next = periods.find((period) => period.from !== undefined && period.from > day);
        return [
          {
            model,
            inputUsdPerMillion: now.input,
            outputUsdPerMillion: now.output,
            changesOn: next?.from ?? null,
            nextInputUsdPerMillion: next?.input ?? null,
            nextOutputUsdPerMillion: next?.output ?? null,
          },
        ];
      });
    },
  };
}
