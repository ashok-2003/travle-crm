"use client";

// Setup step "Ads" (optional): each ad that brought chats, and the package it promotes. Choosing saves at once.
import type { WhatsappAd } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { SelectField } from "@/components/forms/select-field";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useAds, useLinkAd } from "./use-setup-steps";

const NO_PACKAGE = "none";

function AdRow({ ad, packages }: { ad: WhatsappAd; packages: { id: string; name: string }[] }) {
  const t = useTranslations("aiAgent.setup.ads");
  const { timeZone } = useMe().organization;
  const access = useWriteAccess("change");
  const link = useLinkAd();
  // A package deleted since it was linked is no choice, but the ad still shows it, in words, until another is picked.
  const deleted = ad.packageId !== null && !packages.some((one) => one.id === ad.packageId);
  const options = [
    { value: NO_PACKAGE, label: t("noPackage") },
    ...(deleted && ad.packageId !== null ? [{ value: ad.packageId, label: t("deletedPackage") }] : []),
    ...packages.map((one) => ({ value: one.id, label: one.name })),
  ];
  const form = useForm({ defaultValues: { packageId: ad.packageId ?? NO_PACKAGE } });
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        control={form.control}
        name="packageId"
        label={ad.headline ?? t("noHeadline")}
        hint={t("seen", { count: ad.chats, when: formatDay(new Date(ad.lastSeenAt), { timeZone }) })}
        disabled={!access.allowed || link.isPending}
        options={options}
        onChosen={(value) => {
          link.mutate(
            { adId: ad.id, packageId: value === NO_PACKAGE ? null : value },
            // The old choice comes back when the link was refused.
            {
              onError: () => {
                form.reset({ packageId: ad.packageId ?? NO_PACKAGE });
              },
            },
          );
        }}
      />
      <RefusalAlert error={link.error} />
    </div>
  );
}

export function AdsStepEditor() {
  const t = useTranslations("aiAgent.setup.ads");
  const hintId = `${useId()}-write`;
  const access = useWriteAccess("change");
  const ads = useAds();
  if (ads.data === undefined) {
    return ads.isError ? (
      <LoadFailedAlert message={t("loadFailed")} error={ads.error} onRetry={() => void ads.refetch()} />
    ) : (
      <LoadingRows shape="twoLines" label={t("loading")} />
    );
  }
  const { ads: list, packages } = ads.data;
  if (list.length === 0) return <p className="text-muted-foreground">{t("none")}</p>;
  return (
    <div className="flex flex-col gap-4">
      {list.map((ad) => (
        <AdRow key={ad.id} ad={ad} packages={packages} />
      ))}
      <WriteHint id={hintId} hint={access.hint} visible />
    </div>
  );
}
