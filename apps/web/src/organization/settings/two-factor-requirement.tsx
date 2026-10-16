"use client";

// The switch that makes two-factor sign-in compulsory for the whole organization (spec 6.2). A refusal is shown
// under it, and when the reason is that the person hasn't set it up for themselves, a link to do so. Requiring it
// takes access away, which the subscription allows where it refuses other changes; not requiring it is a change
// (ADR 0021), so it is disabled, saying why, while those are refused.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { refusalOf } from "@/data/api-error";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { requirementSwitch } from "./two-factor-requirement-rules";
import { useSetTwoFactorRequirement } from "./use-settings";

export function TwoFactorRequirement() {
  const t = useTranslations("settings.security");
  const tSettings = useTranslations("settings");
  const tCommon = useTranslations("common");
  const me = useMe();
  const { apiError } = useErrorMessage();
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
      <Field orientation="horizontal" data-disabled={disabled || !lifecycle.allowed}>
        <FieldContent>
          <FieldLabel htmlFor="require-two-factor">{t("requireTwoFactor")}</FieldLabel>
          <FieldDescription>{hint}</FieldDescription>
        </FieldContent>
        <Switch
          id="require-two-factor"
          checked={required}
          disabled={disabled || !lifecycle.allowed || change.isPending}
          onCheckedChange={(checked) => {
            change.mutate({ required: checked });
          }}
        />
      </Field>
      {change.isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-2">
            {apiError(change.error)}
            {refusalOf(change.error)?.reason === "ENABLE_TWO_FACTOR_FIRST" && (
              <Link href={routes.account} className="text-primary underline underline-offset-4">
                {t("setUpYours")}
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
