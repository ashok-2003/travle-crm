// What a pipeline card carries while it is dragged to another stage: the lead's id and name, under a type of our own so
// a column takes only a lead, never text or a file dropped on it.
export const DRAGGED_LEAD = "application/x-lead";

export interface DraggedLead {
  id: string;
  name: string;
}

/** The lead a drop carries, or null for anything else. */
export function draggedLeadOf(data: string): DraggedLead | null {
  if (data === "") return null;
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== "object" || value === null) return null;
    const { id, name } = value as Record<string, unknown>;
    return typeof id === "string" && typeof name === "string" ? { id, name } : null;
  } catch {
    return null;
  }
}
