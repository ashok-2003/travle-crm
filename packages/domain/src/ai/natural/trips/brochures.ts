// Labels B1… for the brochures of the trip sheets, and the lines the one agent reads about them (spec 6).
import { oneLine } from "../../lite/context/blocks.js";
import type { TripSheet } from "../types.js";

export interface BrochureLabel {
  label: string;
  packageId: string;
  tripLabel: string;
  attachmentId: string;
  /** The owner's name, else the trip's title: an uploaded file's name is never shown. */
  name: string;
  description: string | null;
}

/** Owner words pass through oneLine: one trimmed line, fenced. One function labels every brochure, so a label names the same file in the block, the tool and the stage (BR3). */
export function brochureLabelsOf(sheets: readonly TripSheet[]): Map<string, BrochureLabel> {
  const labels = new Map<string, BrochureLabel>();
  for (const sheet of sheets) {
    for (const one of sheet.brochures) {
      const label = `B${String(labels.size + 1)}`;
      labels.set(label, {
        label,
        packageId: sheet.packageId,
        tripLabel: sheet.label,
        attachmentId: one.attachmentId,
        name: oneLine(one.name ?? sheet.title),
        description: one.description === null || one.description === "" ? null : oneLine(one.description),
      });
    }
  }
  return labels;
}

/** "## Brochures", one fenced line each, or null with none. */
export function brochuresBlock(sheets: readonly TripSheet[]): string | null {
  const labels = [...brochureLabelsOf(sheets).values()];
  if (labels.length === 0) return null;
  const titles = new Map(sheets.map((sheet) => [sheet.label, sheet.title]));
  const lines = labels.map((one) => {
    const words = `${one.name}: ${one.description ?? "no description yet"}`;
    return `${one.label} · ${one.tripLabel} ${oneLine(titles.get(one.tripLabel) ?? "")} · ${words}`;
  });
  return ["## Brochures", ...lines].join("\n");
}

/** "Brochures sent in this chat: B2 <name>; B5 <name>.", or null when none of them was sent. */
export function sentBrochuresLine(sheets: readonly TripSheet[], sentFileIds: readonly string[]): string | null {
  const sent = new Set(sentFileIds);
  const gone = [...brochureLabelsOf(sheets).values()].filter((one) => sent.has(one.attachmentId));
  if (gone.length === 0) return null;
  return `Brochures sent in this chat: ${gone.map((one) => `${one.label} ${one.name}`).join("; ")}.`;
}
