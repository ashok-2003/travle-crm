"use client";

// A list's Export (spec 3.3; Leads, Bookings and Quotes): an outline button that opens the export dialog for the list as
// it is on screen. It stays mounted while the dialog is closed, so an export being prepared shows its progress again on
// opening (export-dialog.tsx). An export works while the agency is read-only (ADR 0021): the dialog says when it can't.
import { DownloadIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "./export-dialog";
import type { RowsWord } from "./export-failure";
import type { ExportCalls } from "./use-export";

export function ExportButton({
  label,
  title,
  intro,
  holds,
  rowsWord,
  calls,
}: {
  label: string;
  title: string;
  intro: string;
  /** What the file will hold, as the list shows it. */
  holds: ReactNode;
  rowsWord: RowsWord;
  calls: ExportCalls;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <DownloadIcon aria-hidden="true" />
        {label}
      </Button>
      <ExportDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        intro={intro}
        holds={holds}
        rowsWord={rowsWord}
        calls={calls}
      />
    </>
  );
}
