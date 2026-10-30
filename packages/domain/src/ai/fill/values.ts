// A fill's values in one canonical form, so what the AI proposed and what the person saved can be compared by hash (the way
// recordDraftSent compares a sent reply): a destination without its display name, a follow-up without an empty title, a
// quote line without its price. Keys sorted, so the same value always hashes the same.
import { createHash } from "node:crypto";
import type { FillPath } from "@travel-crm/contracts/ai";

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, inner]) => inner !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, inner]) => [key, sorted(inner)]),
    );
  }
  return value;
};

/** The value as it is compared: what the form saves, not what the screen shows. */
export function canonicalValue(path: FillPath, value: unknown): unknown {
  const record = (value ?? {}) as Record<string, unknown>;
  switch (path) {
    case "trip.destination":
      return record.kind === "existing"
        ? { kind: "existing", destinationId: record.destinationId }
        : { kind: "new", name: (typeof record.name === "string" ? record.name : "").toLowerCase() };
    case "call.followUp":
      return {
        due: record.due,
        title: typeof record.title === "string" && record.title !== "" ? record.title : undefined,
      };
    case "quote.items":
      return (Array.isArray(value) ? value : []).map(
        (item: { description?: string; detail?: string; quantity?: number }) => ({
          description: item.description,
          detail: item.detail ?? "",
          quantity: item.quantity,
        }),
      );
    default:
      return value;
  }
}

export function valueHash(path: FillPath, value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sorted(canonicalValue(path, value))))
    .digest("hex");
}

export const proposalHash = (fields: readonly { path: FillPath; value: unknown }[]): string =>
  createHash("sha256")
    .update(JSON.stringify(fields.map((field) => [field.path, valueHash(field.path, field.value)])))
    .digest("hex");
