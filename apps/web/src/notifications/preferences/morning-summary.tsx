"use client";

// The morning summary (release 5, scope 3.3): a push each morning with the plain count of the person's day, "8 things
// today, 2 overdue", at a time they pick on the agency's clock. On unless they switch it off; it reaches only devices
// with push on. A change saves at once and moves back with the reason if it fails. Support impersonating the person can
// see it but not change it (like the other choices, it is the person's own).
import { DEFAULT_MORNING_TIME, type MorningSetting } from "@travel-crm/contracts/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { useMe } from "@/session/me-context";

/** Mornings in quarter hours: 5:00 to 12:00. */
const TIMES = Array.from({ length: 29 }, (_, step) => {
  const minutes = 5 * 60 + step * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/** "09:15" as "9:15 am". */
export function clockWords(time: string): string {
  const hours = Number(time.slice(0, 2));
  const suffix = hours < 12 ? "am" : "pm";
  return `${String(hours % 12 === 0 ? 12 : hours % 12)}:${time.slice(3)} ${suffix}`;
}

export function MorningSummary() {
  const t = useTranslations("notifications.preferences.morning");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { apiError } = useErrorMessage();
  const me = useMe();
  const id = useId();
  const key = trpc.notifications.morning.get.queryKey();
  const setting = useQuery(trpc.notifications.morning.get.queryOptions());
  const save = useMutation(
    trpc.notifications.morning.set.mutationOptions({
      onMutate: async (next) => {
        await queryClient.cancelQueries({ queryKey: key });
        const before = queryClient.getQueryData(key);
        queryClient.setQueryData(key, next);
        return { before };
      },
      onError: (error, _next, onMutateResult) => {
        if (onMutateResult?.before) queryClient.setQueryData(key, onMutateResult.before);
        toast.error(apiError(error), { duration: Infinity });
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: key });
      },
    }),
  );
  const impersonated = me.impersonatedBy !== null;
  const change = (next: Partial<MorningSetting>) => {
    if (setting.data) save.mutate({ ...setting.data, ...next });
  };

  let content;
  if (setting.data === undefined) {
    content = setting.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={setting.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void setting.refetch()}
      />
    ) : (
      <LoadingRows rows={1} shape="twoLines" label={t("loading")} />
    );
  } else {
    const { enabled, time } = setting.data;
    const times = TIMES.includes(time) ? TIMES : [...TIMES, time].sort();
    content = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-col gap-0.5">
            <label htmlFor={`${id}-on`} className="font-medium">
              {t("label")}
            </label>
            <p className="text-label text-muted-foreground">
              {impersonated ? t("impersonating", { name: me.user.name }) : t("hint")}
            </p>
          </div>
          <Switch
            id={`${id}-on`}
            checked={enabled}
            disabled={impersonated}
            onCheckedChange={(checked) => {
              change({ enabled: checked });
            }}
          />
        </div>
        {enabled && (
          <Field>
            <FieldLabel htmlFor={`${id}-time`}>{t("time")}</FieldLabel>
            <Select
              value={time}
              disabled={impersonated}
              onValueChange={(value) => {
                change({ time: value });
              }}
            >
              <SelectTrigger id={`${id}-time`} className="h-auto w-full sm:w-48">
                <SelectValue placeholder={clockWords(DEFAULT_MORNING_TIME)} />
              </SelectTrigger>
              <SelectContent position="popper">
                {times.map((option) => (
                  <SelectItem key={option} value={option}>
                    {clockWords(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
    );
  }
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-section font-semibold">
        {t("heading")}
      </h2>
      <Card>
        <CardContent>{content}</CardContent>
      </Card>
    </section>
  );
}
