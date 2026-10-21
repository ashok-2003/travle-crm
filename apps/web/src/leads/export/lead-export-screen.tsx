"use client";

// A lead export's page (spec 3.3), where the bell's "Your leads export is ready" leads: what it holds, as the list
// showed it when it was asked for (the search is emptied once the file is made), its state, and Download until the file
// is deleted. Shared with the staff export by exports/export-screen.tsx.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/data/trpc";
import { ExportScreen } from "@/exports/export-screen";
import { routes } from "@/lib/routes";
import { useLeadExportHolds } from "./lead-export-holds";
import { useLeadExportCalls } from "./use-lead-export-calls";

export function LeadExportScreen({ exportId }: { exportId: string }) {
  const t = useTranslations("leads.export");
  const trpc = useTRPC();
  const calls = useLeadExportCalls(null);
  const holds = useLeadExportHolds();
  // The same query as the shared screen's own (one key), for the filter and the names it doesn't know.
  const { data: held } = useQuery(trpc.leadExports.get.queryOptions({ exportId }));
  return (
    <ExportScreen
      title={t("title")}
      holds={
        held
          ? holds(held.filter, {
              ownerName: held.filter.ownerUserId === undefined ? null : (held.people[held.filter.ownerUserId] ?? null),
              destinationName: held.destinationName,
            })
          : ""
      }
      calls={calls}
      exportId={exportId}
      back={{ href: routes.leads, label: t("back") }}
    />
  );
}
