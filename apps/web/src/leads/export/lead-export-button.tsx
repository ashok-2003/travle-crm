"use client";

// The Leads header's Export (spec 3.1, 3.3), for everyone who sees the list (leads:view): a dialog that asks for the
// list as it is on screen, the stage, filters and search included, as Excel or CSV. It is an export (ADR 0021), so it
// works while the agency is read-only. The dialog stays mounted while closed, so an export being prepared shows its
// progress again on opening (exports/export-dialog.tsx).
import type { LeadExportFilter } from "@travel-crm/contracts/crm";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useTRPC } from "@/data/trpc";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/exports/export-dialog";
import { useHolds, useMe, viewScope } from "@/session/me-context";
import { listFiltersOf } from "../list/list-filters";
import { useListSearch } from "../list/use-list-search";
import { useLeadExportHolds } from "./lead-export-holds";
import { useLeadExportCalls } from "./use-lead-export-calls";

export function LeadExportButton() {
  const t = useTranslations("leads.export");
  const trpc = useTRPC();
  const mayExport = useHolds("leads:view");
  const ownOnly = viewScope(useMe(), "leads:view") !== "all";
  const listed = listFiltersOf(useSearchParams(), ownOnly ? "own" : "all");
  const [search] = useListSearch();
  // The list's input without its paging: the export reads every page.
  const asked: LeadExportFilter = {
    view: listed.view,
    stage: listed.stage,
    ...(listed.ownerUserId && { ownerUserId: listed.ownerUserId }),
    ...(listed.source && { source: listed.source }),
    ...(listed.destinationId && { destinationId: listed.destinationId }),
    ...(listed.tripType && { tripType: listed.tripType }),
    ...(search !== "" && { search }),
  };
  const [open, setOpen] = useState(false);
  const calls = useLeadExportCalls(asked);
  const holds = useLeadExportHolds();
  // The owner and the destination are ids in the address; the api names them by id, whichever destination it is.
  const named = asked.ownerUserId !== undefined || asked.destinationId !== undefined;
  const names = useQuery(
    trpc.leadExports.names.queryOptions(
      {
        ...(asked.ownerUserId && { ownerUserId: asked.ownerUserId }),
        ...(asked.destinationId && { destinationId: asked.destinationId }),
      },
      { enabled: named },
    ),
  );
  if (!mayExport) return null;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <DownloadIcon aria-hidden="true" />
        {t("button")}
      </Button>
      <ExportDialog
        open={open}
        onOpenChange={setOpen}
        title={t("dialog.title")}
        intro={t("dialog.intro")}
        holds={holds(asked, {
          ownerName: asked.ownerUserId === undefined ? null : (names.data?.people[asked.ownerUserId] ?? null),
          destinationName: names.data?.destinationName ?? null,
        })}
        rowsWord="leads"
        calls={calls}
      />
    </>
  );
}
