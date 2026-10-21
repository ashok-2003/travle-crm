"use client";

// Export on the Staff screen (spec 3.1, 3.5, B52): an outline button beside Add staff that opens the export dialog, with
// no filters: "18 people, with their roles and joined dates". It stays mounted while the dialog is closed, so the dialog
// shows a file being made again on opening. An export is allowed while the agency is read-only (ADR 0021), so the
// button is off only when even that is refused, and says why.
import { DownloadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/exports/export-dialog";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useStaffExportCalls } from "./use-staff-export-calls";

export function StaffExportButton({ count }: { count: number }) {
  const t = useTranslations("staff");
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const write = useWriteAccess("export");
  const calls = useStaffExportCalls();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        ref={opener}
        variant="outline"
        disabled={!write.allowed}
        aria-describedby={write.hint === null ? undefined : hintId}
        onClick={() => {
          setOpen(true);
        }}
      >
        <DownloadIcon aria-hidden="true" />
        {t("header.export")}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
      <ExportDialog
        open={open}
        onOpenChange={setOpen}
        title={t("export.title")}
        intro={t("export.intro", { count })}
        holds={t("export.holds")}
        rowsWord="people"
        calls={calls}
      />
    </div>
  );
}
