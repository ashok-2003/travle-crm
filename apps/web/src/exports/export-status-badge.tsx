// An export's state as a badge (spec 3.3): ready in green, failed in red, preparing and deleted neutral. Always the
// word with its dot.
import type { ExportStatus } from "@travel-crm/contracts/exports";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const toneOf: Record<ExportStatus, StatusTone> = {
  making: "neutral",
  ready: "good",
  failed: "bad",
  expired: "neutral",
};

export function ExportStatusBadge({ status }: { status: ExportStatus }) {
  const t = useTranslations("exports.statuses");
  return <StatusBadge tone={toneOf[status]}>{t(status)}</StatusBadge>;
}
