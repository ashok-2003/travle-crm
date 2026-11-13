// The Understand context's smaller blocks: today, the team's last notes, and the index of the trips on offer.
import { calendarDateIn, formatShortDay, parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import type { PackageIndexEntry, TimelineLine } from "../types.js";
import { understandBlockHeads } from "./block-heads.js";
import { oneLine, type Block } from "./blocks.js";
import { stageLabel } from "./lead-card.js";

const TIMELINE_LINES = 3;
const NOTE_TEXT = 100;
const MOST_LISTED = 30;

// Any year but this one: the short day then always carries its year, which "today" must.
const NO_YEAR = parseCalendarDate("1900-01-01");

/** "Thu 12 Nov 2026, Asia/Kolkata" */
export function todayLine(today: CalendarDate, timeZone: string): string {
  return `${formatShortDay(today, NO_YEAR)}, ${timeZone}`;
}

/** The last notes and stage changes, newest first. */
export function timelineLines(lines: TimelineLine[], timeZone: string, today: CalendarDate): string[] {
  return [...lines]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, TIMELINE_LINES)
    .map((line) => {
      const day = formatShortDay(calendarDateIn(line.at, timeZone), today);
      const text = oneLine(line.text);
      return line.kind === "note"
        ? `${day} · Note: ${text.slice(0, NOTE_TEXT)}`
        : `${day} · Stage: ${stageLabel(line.text)}`;
    });
}

function packageLine(entry: PackageIndexEntry): string {
  const parts = [
    oneLine(entry.title),
    entry.place === null ? null : oneLine(entry.place),
    entry.nights === null ? null : `${String(entry.nights)} ${entry.nights === 1 ? "night" : "nights"}`,
    entry.startCity === "" ? null : `from ${oneLine(entry.startCity)}`,
  ];
  return `- ${parts.filter((part) => part !== null && part !== "").join(" · ")}`;
}

/** The trips on offer, one per line; with too many to list, only the places they run. */
export function packageIndexBlock(entries: PackageIndexEntry[]): Block {
  const lines = entries.map(packageLine);
  // A list cut short would say "there are no others" of trips it left out: list them all or only their places.
  if (entries.length <= MOST_LISTED && lines.join("\n").length <= understandBlockHeads.packageIndex.budget)
    return {
      ...understandBlockHeads.packageIndex,
      lines,
    };
  const places = [
    ...new Set(
      entries
        .map((entry) => (entry.place === null ? null : oneLine(entry.place)))
        .filter((place) => place !== null && place !== ""),
    ),
  ];
  return {
    ...understandBlockHeads.places,
    lines: places.sort().map((place) => `- ${String(place)}`),
  };
}
