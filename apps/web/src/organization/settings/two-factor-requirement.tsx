"use client";

// The switch that makes two-factor sign-in compulsory for the whole organization (spec 6.2). A refusal is shown
// under it, and when the reason is that the person hasn't set it up for themselves, a link to do so.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
  const settings = useQuery({ ...trpc.settings.get.queryOptions(), refetchOnMount: "always" });
  const change = useSetTwoFactorRequirement();

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

  return (
    <div className="flex flex-col gap-3">
      <Field orientation="horizontal" data-disabled={disabled}>
        <FieldContent>
          <FieldLabel htmlFor="require-two-factor">{t("requireTwoFactor")}</FieldLabel>
          <FieldDescription>{reason === null ? t("requireTwoFactorHint") : t(reason)}</FieldDescription>
        </FieldContent>
        <Switch
          id="require-two-factor"
          checked={required}
          disabled={disabled || change.isPending}
          onCheckedChange={(checked) => {
            change.mutate(
              { required: checked },
              { onSuccess: (saved) => toast.success(saved.requireTwoFactor ? t("turnedOn") : t("turnedOff")) },
            );
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
