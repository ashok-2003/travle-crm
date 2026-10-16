// An issued document's status (DESIGN.md: a dot and a word): Ready, Being prepared, or Can't be made.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { documentState, stateTones } from "./document-state";

export function DocumentStatus({ document }: { document: IssuedDocumentSummary }) {
  const t = useTranslations("documents.status");
  const state = documentState(document);
  return <StatusBadge tone={stateTones[state]}>{t(state)}</StatusBadge>;
}
