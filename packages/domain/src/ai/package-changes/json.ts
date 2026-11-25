// A run's proposal and before-values as its JSON columns keep them: their JSON form (a trip field's values are unknown-typed).
import type { JsonValue } from "../../jobs/index.js";

export const jsonOf = (value: object): Readonly<Record<string, JsonValue>> =>
  JSON.parse(JSON.stringify(value)) as Readonly<Record<string, JsonValue>>;
