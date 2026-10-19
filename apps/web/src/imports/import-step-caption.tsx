// The caption under an import's title (spec 3.2): which of the four steps the import is at, "Step 2 of 4 · Match
// columns". A cancelled or expired import is at none.
import type { ImportStatus } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";

type Step =
  { step: 1; name: "choose" } | { step: 2; name: "match" } | { step: 3; name: "check" } | { step: 4; name: "add" };

const stepOf: Record<ImportStatus, Step | null> = {
  uploading: { step: 1, name: "choose" },
  reading: { step: 1, name: "choose" },
  unreadable: { step: 1, name: "choose" },
  matching: { step: 2, name: "match" },
  checking: { step: 3, name: "check" },
  checked: { step: 3, name: "check" },
  adding: { step: 4, name: "add" },
  done: { step: 4, name: "add" },
  stopped: { step: 4, name: "add" },
  failed: { step: 4, name: "add" },
  cancelled: null,
  expired: null,
};

export function ImportStepCaption({ status }: { status: ImportStatus }) {
  const t = useTranslations("imports.steps");
  const step = stepOf[status];
  if (step === null) return null;
  return <p className="text-label text-muted-foreground">{t("caption", { step: step.step, name: t(step.name) })}</p>;
}
