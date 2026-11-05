"use client";

// Whether the AI may sell a group package (group packages): a switch that stays off, with what is missing in words,
// until the package is ready; whoever manages settings turns it on or off, others read where it stands.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/bookings/section-card";
import { RefusalAlert } from "@/components/refusal-alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { usePackageChanges } from "./use-packages";

export function SellCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.sell");
  const id = useId();
  const mayManage = useHolds("settings:manage");
  const access = useWriteAccess("change");
  const { setSellable } = usePackageChanges();
  const blocked = !detail.sellable && detail.sellGaps.length > 0;
  return (
    <SectionCard title={t("title")}>
      <Field orientation="horizontal" className="min-h-11">
        <Switch
          id={id}
          checked={detail.sellable}
          disabled={setSellable.isPending || !access.allowed || !mayManage || blocked}
          onCheckedChange={(sellable) => {
            setSellable.mutate(
              { packageId: detail.id, sellable },
              { onSuccess: () => toast.success(t(sellable ? "nowOn" : "nowOff")) },
            );
          }}
        />
        <FieldLabel htmlFor={id} className="font-normal">
          {t("label")}
        </FieldLabel>
      </Field>
      <FieldDescription>{t(detail.sellable ? "on" : "off")}</FieldDescription>
      {blocked && (
        <div>
          <p className="font-semibold">{t("needs")}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {detail.sellGaps.map((gap) => (
              <li key={gap}>{t(`gaps.${gap}`)}</li>
            ))}
          </ul>
        </div>
      )}
      <RefusalAlert error={setSellable.error} />
    </SectionCard>
  );
}
