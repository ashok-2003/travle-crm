"use client";

// New quote for a lead (step 3, P0): a button whose menu starts one blank from what the lead already says (where, when,
// who), or from one of the agency's ready packages in a tap (sales execution, fast quoting), and opens it. The lead's
// card and the Quotes list's New quote both use it.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { quoteRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { MakeQuotesDialog } from "./make-quotes-dialog";
import { useQuoteChanges, useQuotePackages, useQuoteSettings } from "./use-quotes";

export function NewQuoteMenu({ lead, onPending }: { lead: LeadDetail; onPending?: (pending: boolean) => void }) {
  const t = useTranslations("quotes.lead");
  const router = useRouter();
  const mayCreate = useHolds("quotes:create");
  const access = useWriteAccess("change");
  const settings = useQuoteSettings();
  const { create } = useQuoteChanges();
  const packages = useQuotePackages();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [making, setMaking] = useState<{ id: string; name: string } | null>(null);
  const busy = create.isPending;
  // A dialog holding this menu stays open while the quote is made, so its success (opening the quote) is not lost.
  useEffect(() => {
    onPending?.(busy);
  }, [busy, onPending]);
  const { trip } = lead;
  if (!mayCreate) return null;
  const start = () => {
    create.mutate(
      {
        leadId: lead.id,
        title: trip.destination === null ? t("defaultTitle") : t("titleFor", { place: trip.destination.name }),
        startDate: trip.when.kind === "dates" ? trip.when.from : null,
        adults: trip.adults ?? 2,
        children: trip.childrenAges.length,
        days: [],
        items: [],
        inclusions: "",
        exclusions: "",
        notes: "",
        taxRateBasisPoints: settings.data?.defaultTaxRateBasisPoints ?? 500,
        placeOfSupply: null,
      },
      {
        onSuccess: (quote) => {
          router.push(quoteRoute(quote.id));
        },
      },
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={menuButton} disabled={busy || !access.allowed}>
            {busy ? <Spinner aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}
            {t("new")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuItem onSelect={start}>{t("blank")}</DropdownMenuItem>
          {(packages.data ?? []).length > 0 && <DropdownMenuSeparator />}
          {(packages.data ?? []).length > 0 && <DropdownMenuLabel>{t("fromPackage")}</DropdownMenuLabel>}
          {(packages.data ?? []).map((one) => (
            <DropdownMenuItem
              key={one.id}
              onSelect={() => {
                setMaking({ id: one.id, name: one.name });
              }}
            >
              {one.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <RefusalAlert error={create.error} />
      {making !== null && (
        <MakeQuotesDialog
          lead={lead}
          packageId={making.id}
          packageName={making.name}
          open
          onOpenChange={(next) => {
            if (!next) setMaking(null);
          }}
          returnFocusTo={menuButton}
        />
      )}
    </div>
  );
}
