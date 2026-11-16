"use client";

// Whether the AI may sell a group package (group packages): a switch that stays off, with what is missing in words,
// until the package is ready; whoever manages settings turns it on or off, others read where it stands.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/bookings/section-card";
import { TextLink } from "@/components/text-link";
import { RefusalAlert } from "@/components/refusal-alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { setupHref } from "@/ai/agent/agent-overview";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { usePackageChanges } from "./use-packages";

/** Where to add what is missing: the agency's payment QR is on the AI agent's Setup tab, the rest is further down this page. */
const gapPlace: Record<PackageDetail["sellGaps"][number], string> = {
  room_types: "#group-details",
  prices: "#package-seasons",
  advance: "#group-details",
  departures: "#package-departures",
  from_price: "#package-details",
  payment_details: `${setupHref}#step-payment`,
};

export function SellCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.sell");
  const id = useId();
  const hintId = `${id}-write`;
  const needsId = `${id}-needs`;
  const mayManage = useHolds("settings:manage");
  const access = useWriteAccess("change");
  const { setSellable } = usePackageChanges();
  const blocked = !detail.sellable && detail.sellGaps.length > 0;
  const gaps = detail.sellGaps.length > 0;
  return (
    <SectionCard title={t("title")}>
      <Field orientation="horizontal" className="min-h-11">
        <Switch
          id={id}
          checked={detail.sellable}
          aria-describedby={
            [access.hint === null ? null : hintId, blocked ? needsId : null].filter(Boolean).join(" ") || undefined
          }
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
      <WriteHint id={hintId} hint={access.hint} visible />
      {/* Switched on with a gap is not offered: the line says so, above the list of what it still needs. */}
      <FieldDescription>{t(detail.sellable && !gaps ? "on" : "off")}</FieldDescription>
      {!mayManage && <p className="text-caption text-muted-foreground">{t("managerOnly")}</p>}
      {gaps && (
        <div>
          <p id={needsId} className="font-semibold">
            {t(detail.sellable ? "stillNeeds" : "needs")}
          </p>
          {/* One link a line, each a 44px touch target. */}
          <ul className="flex flex-col">
            {detail.sellGaps.map((gap) => (
              <li key={gap}>
                <TextLink href={gapPlace[gap]}>{t(`gaps.${gap}`)}</TextLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      <RefusalAlert error={setSellable.error} />
    </SectionCard>
  );
}
