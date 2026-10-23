// A Page's state as a badge (spec 3.1): running in green, paused neutral, Needs attention amber, Needs reconnecting red.
// Always the word with its dot.
import type { MetaPageBadge } from "@travel-crm/contracts/meta-leads";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const toneOf: Record<MetaPageBadge, StatusTone> = {
  running: "good",
  paused: "neutral",
  needs_attention: "attention",
  needs_reconnect: "bad",
};

export function MetaBadge({ badge, readOnly = false }: { badge: MetaPageBadge; readOnly?: boolean }) {
  const t = useTranslations("metaLeads.badges");
  // A running Page of a read-only agency saves nothing: it shows as paused, not as running.
  const shown = readOnly && badge === "running" ? "paused" : badge;
  return <StatusBadge tone={toneOf[shown]}>{t(shown)}</StatusBadge>;
}
