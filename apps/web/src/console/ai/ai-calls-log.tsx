"use client";

// Every AI call, newest first, a page at a time (the owner, 2026-11-02: every log line): when, which agency, which feature
// and model, how it ended, the tokens, how long it took and what it cost. For every agency or one, all or only the failed.
import type { AiCallLine, AiOrganizationUsage } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useInstantText } from "@/components/instant-text";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { StatusBadge } from "@/components/status-badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatCount } from "@/lib/format";
import { rupeesOf } from "../growth/usage-screen";
import { useFeatureName } from "./feature-name";
import { useAiCalls } from "./use-ai-usage";

const EVERY_AGENCY = "every";

function CallItem({ call }: { call: AiCallLine }) {
  const t = useTranslations("consoleAi");
  const instantText = useInstantText();
  const feature = useFeatureName()(call.feature);
  return (
    <Item size="sm" role="listitem">
      <ItemContent>
        <ItemTitle className="flex flex-wrap items-center gap-2">
          <span>{call.organizationName}</span>
          <StatusBadge tone={call.outcome === "ok" ? "good" : "bad"}>{t(`calls.outcomes.${call.outcome}`)}</StatusBadge>
        </ItemTitle>
        <ItemDescription className="flex flex-col gap-0.5">
          <span>{t("calls.line", { feature, model: call.model === "" ? t("calls.noModel") : call.model })}</span>
          <span className="numbers">
            {instantText(call.occurredAt)} · {t("calls.took", { seconds: (call.durationMs / 1000).toFixed(1) })} ·{" "}
            {t("calls.tokens", { input: formatCount(call.inputTokens), output: formatCount(call.outputTokens) })}
            {call.costPaise !== null && ` · ${rupeesOf(call.costPaise)}`}
          </span>
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

export function AiCallsLog({ organizations }: { organizations: AiOrganizationUsage[] }) {
  const t = useTranslations("consoleAi.calls");
  const ids = { agency: useId(), failed: useId() };
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [failedOnly, setFailedOnly] = useState(false);
  const calls = useAiCalls({ organizationId, failedOnly });

  let list;
  if (calls.items === undefined) {
    list = calls.isError ? (
      <LoadFailedAlert message={t("heading")} error={calls.error} onRetry={() => void calls.refetch()} />
    ) : (
      <LoadingRows rows={4} label={t("label")} />
    );
  } else if (calls.items.length === 0) {
    list = <p className="text-muted-foreground">{t("empty")}</p>;
  } else {
    list = (
      <>
        <ItemGroup role="list" aria-label={t("label")}>
          {calls.items.map((call) => (
            <CallItem key={call.id} call={call} />
          ))}
        </ItemGroup>
        <ShowMoreButton pages={calls} label={t("showMore")} />
      </>
    );
  }

  return (
    <section aria-labelledby="ai-calls-heading" className="flex flex-col gap-3">
      <h2 id="ai-calls-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-60 flex-col gap-2">
          <Label htmlFor={ids.agency}>{t("agency")}</Label>
          <Select
            value={organizationId ?? EVERY_AGENCY}
            onValueChange={(value) => {
              setOrganizationId(value === EVERY_AGENCY ? null : value);
            }}
          >
            <SelectTrigger id={ids.agency} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EVERY_AGENCY}>{t("allAgencies")}</SelectItem>
              {organizations.map((organization) => (
                <SelectItem key={organization.organizationId} value={organization.organizationId}>
                  {organization.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-11 items-center gap-3">
          <Switch id={ids.failed} checked={failedOnly} onCheckedChange={setFailedOnly} />
          <Label htmlFor={ids.failed}>{t("failedOnly")}</Label>
        </div>
      </div>
      {list}
    </section>
  );
}
