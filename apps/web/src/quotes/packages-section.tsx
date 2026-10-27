"use client";

// The agency's ready packages on /quotes (sales execution, fast quoting): each with its days and price before GST, and
// Delete. A package is made from a quote's Save as package and used from a lead's New quote.
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { useHolds } from "@/session/me-context";
import { useQuoteChanges, useQuotePackages } from "./use-quotes";

export function PackagesSection() {
  const t = useTranslations("quotes.package");
  const packages = useQuotePackages();
  const mayEdit = useHolds("quotes:edit");
  const { deletePackage } = useQuoteChanges();
  const [deleting, setDeleting] = useState<QuotePackage | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("listTitle")}</h2>
        </CardTitle>
        <CardDescription>{t("listIntro")}</CardDescription>
      </CardHeader>
      <CardContent>
        {(packages.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">{t("none")}</p>
        ) : (
          <ItemGroup>
            {(packages.data ?? []).map((one) => (
              <Item key={one.id} size="sm">
                <ItemContent>
                  <ItemTitle>{one.name}</ItemTitle>
                  <ItemDescription className="numbers">
                    {t("summary", { days: one.days, price: rupees(one.subtotalPaise) })}
                  </ItemDescription>
                </ItemContent>
                {mayEdit && (
                  <ItemActions>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("deleteNamed", { name: one.name })}
                      onClick={() => {
                        setDeleting(one);
                      }}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </ItemActions>
                )}
              </Item>
            ))}
          </ItemGroup>
        )}
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(next) => {
            if (!next) setDeleting(null);
          }}
          title={t("deleteTitle", { name: deleting?.name ?? "" })}
          description={t("deleteDescription")}
          action={t("delete")}
          request={deletePackage}
          onConfirm={() => {
            if (deleting === null) return;
            deletePackage.mutate(
              { packageId: deleting.id },
              {
                onSuccess: () => {
                  setDeleting(null);
                },
              },
            );
          }}
        />
      </CardContent>
    </Card>
  );
}
