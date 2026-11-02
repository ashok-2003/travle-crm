"use client";

// A package's tiers (release 7b): Standard, Deluxe. A tier is a set of priced lines; making a quote from the package turns each
// tier chosen into an option of the quote, priced from the season covering the start date. A package with no tiers makes a
// quote from the lines it was saved with.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { MAX_TIERS } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/bookings/section-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { TierDialog } from "./tier-dialog";
import { usePackageChanges } from "./use-packages";

export function TiersCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.tiers");
  const { removeTier } = usePackageChanges();
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  return (
    <SectionCard title={t("title")}>
      <p className="text-muted-foreground">{t("intro")}</p>
      {detail.tiers.length === 0 ? (
        <p className="text-muted-foreground">{t("none", { count: detail.items.length })}</p>
      ) : (
        <ItemGroup>
          {detail.tiers.map((tier) => (
            <Item key={tier.id} size="sm" role="listitem">
              <ItemContent>
                <ItemTitle>{tier.name}</ItemTitle>
                <ItemDescription>{t("lines", { count: tier.lines.length })}</ItemDescription>
              </ItemContent>
              <ItemActions className="flex-wrap">
                <TierDialog packageId={detail.id} tier={tier} />
                <Button
                  variant="ghost"
                  aria-label={t("removeNamed", { name: tier.name })}
                  onClick={() => {
                    setRemoving({ id: tier.id, name: tier.name });
                  }}
                >
                  {t("remove")}
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      {detail.tiers.length < MAX_TIERS && (
        <div>
          <TierDialog packageId={detail.id} tier={null} />
        </div>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title={t("removeTitle", { name: removing?.name ?? "" })}
        description={t("removeDescription")}
        action={t("remove")}
        request={removeTier}
        onConfirm={() => {
          if (removing === null) return;
          removeTier.mutate(
            { tierId: removing.id },
            {
              onSuccess: () => {
                toast.success(t("removed"));
                setRemoving(null);
              },
            },
          );
        }}
      />
    </SectionCard>
  );
}
