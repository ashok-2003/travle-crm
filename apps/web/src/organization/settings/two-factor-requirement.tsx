"use client";

// The switch that makes two-factor sign-in compulsory for the whole organization (spec 6.2). A refusal is shown
// under it, and when the reason is that the person hasn't set it up for themselves, a link to do so. Requiring it
// takes access away, which the subscription allows where it refuses other changes; not requiring it is a change
// (ADR 0021), so it is disabled, saying why, while those are refused. It is an Item like the settings rows around it,
// the reason its description.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { refusalOf } from "@/data/api-error";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { requirementSwitch } from "./two-factor-requirement-rules";
import { useSetTwoFactorRequirement } from "./use-settings";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";

export function TwoFactorRequirement() {
  const t = useTranslations("settings.security");
  const tSettings = useTranslations("settings");
  const tCommon = useTranslations("common");
  const me = useMe();
  const trpc = useTRPC();
  // Always asked again when the screen opens: the copy restored from IndexedDB can predate a change just made.
  const settings = useQuery(trpc.settings.get.queryOptions());
  const change = useSetTwoFactorRequirement();
  const turnOn = useWriteAccess("revoke");
  const turnOff = useWriteAccess("change");

  if (!settings.data) {
    return settings.isError ? (
      <ErrorState
        message={tSettings("loadFailed")}
        error={settings.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void settings.refetch()}
      />
    ) : (
      <Skeleton className="h-16 w-full" />
    );
  }
  const required = settings.data.requireTwoFactor;
  const { disabled, reason } = requirementSwitch({ required, isOwner: me.member.role.isOwner });
  const lifecycle = required ? turnOff : turnOn;
  const hint = reason === null ? (lifecycle.hint ?? t("requireTwoFactorHint")) : t(reason);

  return (
    <div className="flex flex-col gap-3">
      <Item size="sm">
        <ItemContent>
          <ItemTitle>
            <Label htmlFor="require-two-factor">{t("requireTwoFactor")}</Label>
          </ItemTitle>
          <ItemDescription id="require-two-factor-hint">{hint}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            id="require-two-factor"
            aria-describedby="require-two-factor-hint"
            checked={required}
            disabled={disabled || !lifecycle.allowed || change.isPending}
            onCheckedChange={(checked) => {
              change.mutate({ required: checked });
            }}
          />
        </ItemActions>
      </Item>
      <RefusalAlert error={change.error} />
      {refusalOf(change.error)?.reason === "ENABLE_TWO_FACTOR_FIRST" && (
        <TextLink href={routes.account}>{t("setUpYours")}</TextLink>
      )}
    </div>
  );
}
