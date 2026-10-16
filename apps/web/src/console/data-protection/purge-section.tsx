"use client";

// Deleting the organization for good (spec 5, ADR 0023): offered once it is cancelled (by its lifecycle today) and has
// an export finished in the last day, each condition shown met or not with what to do; the console's job checks both
// again before it deletes anything. Its result comes from the platform log.
import type { OrganizationDetails, OrganizationExport } from "@travel-crm/contracts/platform";
import { CircleCheckIcon, CircleDashedIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { hasFreshExport } from "./fresh-export";
import { useJobOutcome } from "./job-outcome";
import { PurgeDialog } from "./purge-dialog";

const SKIP_REASONS = ["not-cancelled", "no-recent-export"] as const;

function Condition({ met, done, toDo }: { met: boolean; done: string; toDo: string }) {
  const t = useTranslations("consolePlatform.dataProtection.purge");
  const Icon = met ? CircleCheckIcon : CircleDashedIcon;
  return (
    <li className="flex items-start gap-2">
      <Icon
        aria-hidden="true"
        className={met ? "mt-0.5 size-4 shrink-0 text-status-good-ink" : "mt-0.5 size-4 shrink-0 text-muted-foreground"}
      />
      <span>
        <span className="sr-only">{met ? t("met") : t("unmet")} </span>
        {met ? done : toDo}
      </span>
    </li>
  );
}

export function PurgeSection({
  details,
  exports,
}: {
  details: OrganizationDetails;
  exports: OrganizationExport[] | undefined;
}) {
  const t = useTranslations("consolePlatform.dataProtection.purge");
  const { organization } = details;
  const [confirming, setConfirming] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  const outcome = useJobOutcome({
    organizationId: organization.id,
    requested: "organization.purge-requested",
    results: ["organization.purged", "organization.purge-skipped"],
    since,
  });
  // The state due today, which the api decides by (ADR 0021), not the one last recorded.
  const cancelled = details.subscription?.subscription.status === "cancelled";
  const exported = hasFreshExport(exports ?? []);

  let result: string | null = null;
  if (outcome?.action === "organization.purged") {
    const count = (field: string) => formatCount(Number(outcome.after?.[field] ?? 0));
    result = t("purged", { rows: count("rows"), people: count("people"), files: count("files") });
  } else if (outcome) {
    const reason = SKIP_REASONS.find((known) => known === outcome.after?.reason) ?? "no-recent-export";
    result = t(`skipped.${reason}`);
  }

  return (
    <section aria-labelledby="organization-purge" className="flex flex-col gap-4">
      <div className="flex max-w-[65ch] flex-col gap-1">
        <h2 id="organization-purge" className="text-section font-semibold">
          {t("title")}
        </h2>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <ul className="flex flex-col gap-2">
        <Condition met={cancelled} done={t("cancelled")} toDo={t("notCancelled")} />
        <Condition met={exported} done={t("exported")} toDo={t("notExported")} />
      </ul>
      <Button
        variant="destructive"
        className="self-start"
        disabled={!cancelled || !exported || since !== null}
        onClick={() => {
          setConfirming(true);
        }}
      >
        {t("action")}
      </Button>
      {since !== null && (
        <p role="status" className="max-w-[65ch]">
          {result ?? t("queued")}
        </p>
      )}
      {confirming && (
        <PurgeDialog
          organization={organization}
          open
          onOpenChange={setConfirming}
          onQueued={() => {
            setSince(Date.now());
          }}
        />
      )}
    </section>
  );
}
