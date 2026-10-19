// An import's state as a badge (spec 3.2): waiting for you in amber, done in green, failed and unreadable in red,
// everything else (reading, checking, adding, stopped, cancelled, expired) neutral. Always the word with its dot.
import type { ImportStatus } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const toneOf: Record<ImportStatus, StatusTone> = {
  uploading: "neutral",
  reading: "neutral",
  unreadable: "bad",
  matching: "attention",
  checking: "neutral",
  checked: "attention",
  adding: "neutral",
  done: "good",
  stopped: "neutral",
  failed: "bad",
  cancelled: "neutral",
  expired: "neutral",
};

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  const t = useTranslations("imports.statuses");
  return <StatusBadge tone={toneOf[status]}>{t(status)}</StatusBadge>;
}
