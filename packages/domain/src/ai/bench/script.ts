// The scripted model for CI and `--fake`: a case's answers in the order its turns ask for them, each Understand answer
// laid over a quiet form so a case names only what it changes.
import type { LiteCase } from "@travel-crm/contracts/ai";
import { createMemoryAiModel, type MemoryAiModel } from "@travel-crm/integrations/ai";

const quietDetails = {
  package: null,
  place: null,
  date: null,
  adults: null,
  children: null,
  name: null,
  pickup_city: null,
  room: null,
  pay_in_full: null,
};
const quietScore = {
  chance: 50,
  label: "warm",
  reasons: [],
  looks_fake: false,
  fake_why: "",
  standing: "",
  next_step: "",
};
const quietForm = {
  intents: [{ name: "other", proof: "" }],
  details: quietDetails,
  open_to_other_trips: "unknown",
  lookups: [],
  language: "english",
  summary: "",
  score: quietScore,
};

const objectOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** One memory-model answer per scripted entry, in order; `details` and `score` merge one level deeper. */
export function benchModel(one: LiteCase): MemoryAiModel {
  const model = createMemoryAiModel();
  model.answer(
    ...one.scripted.map((entry) => {
      if ("raw" in entry) return entry.raw;
      if ("write" in entry) return JSON.stringify(entry.write);
      const said = entry.understand;
      return JSON.stringify({
        ...quietForm,
        ...said,
        details: { ...quietDetails, ...objectOf(said.details) },
        score: { ...quietScore, ...objectOf(said.score) },
      });
    }),
  );
  return model;
}
