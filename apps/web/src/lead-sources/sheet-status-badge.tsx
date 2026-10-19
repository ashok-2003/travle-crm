// A sheet's state as a badge (spec 6.5): running in green, paused and setting up neutral, the three that stop rows
// (tab, columns, a manager) in amber as "Needs attention", lost access in red. Always the word with its dot.
import type { SheetStatus } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

type Shown = "running" | "paused" | "attention" | "lost_access" | "connecting";

const shownOf: Record<SheetStatus, Shown> = {
  connecting: "connecting",
  running: "running",
  paused: "paused",
  lost_access: "lost_access",
  tab_missing: "attention",
  columns_missing: "attention",
  needs_manager: "attention",
  disconnected: "paused",
};

const toneOf: Record<Shown, StatusTone> = {
  running: "good",
  paused: "neutral",
  attention: "attention",
  lost_access: "bad",
  connecting: "neutral",
};

export function SheetStatusBadge({ status }: { status: SheetStatus }) {
  const t = useTranslations("sheets.statuses");
  const shown = shownOf[status];
  return <StatusBadge tone={toneOf[shown]}>{t(shown)}</StatusBadge>;
}
