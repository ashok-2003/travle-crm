"use client";

// The violet "Read a rate sheet" button on a supplier's Rates (release ai3b): offered to whoever edits suppliers, when the plan has the
// AI and the agency has it on. It opens the dialog; the AI proposes, a person checks and saves.
import type { RateSeason } from "@travel-crm/contracts/suppliers";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSuggestReplyAvailable } from "../use-ai";
import { RateSheetDialog } from "./rate-sheet-dialog";

export function RateSheetButton({ supplierId, seasons }: { supplierId: string; seasons: readonly RateSeason[] }) {
  const t = useTranslations("ai.rates");
  const aiOn = useSuggestReplyAvailable();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!aiOn) return null;
  return (
    <>
      <Button
        ref={opener}
        variant="ai"
        onClick={() => {
          setOpen(true);
        }}
      >
        <SparklesIcon aria-hidden="true" />
        {t("button")}
      </Button>
      <RateSheetDialog
        supplierId={supplierId}
        supplierSeasons={seasons}
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={opener}
      />
    </>
  );
}
