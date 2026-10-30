"use client";

// /settings/departures (release 7a): how long a hold lasts, when a batch reads "Filling fast", and the beds in a room when the
// rooms are drafted.
import {
  saveDepartureSettingsInput,
  type DepartureSettingsView,
  type SaveDepartureSettingsInput,
} from "@travel-crm/contracts/departures";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { checked } from "@/components/forms/checked";
import { FormAlert } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDepartureChanges, useDepartureSettings } from "./use-departures";

type Problem = "required" | "invalid";
interface Values {
  holdHours: string;
  fillingFastPercent: string;
  defaultRoomCapacity: string;
}
const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : -1);

function SettingsForm({ saved }: { saved: DepartureSettingsView }) {
  const t = useTranslations("departures.settings");
  const { saveSettings } = useDepartureChanges();
  const values: Values = {
    holdHours: String(saved.holdHours),
    fillingFastPercent: String(saved.fillingFastPercent),
    defaultRoomCapacity: String(saved.defaultRoomCapacity),
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SaveDepartureSettingsInput, Problem>(
    values,
    (typed) =>
      checked(
        saveDepartureSettingsInput.safeParse({
          holdHours: whole(typed.holdHours),
          fillingFastPercent: whole(typed.fillingFastPercent),
          defaultRoomCapacity: whole(typed.defaultRoomCapacity),
        }),
        typed,
        (path) => (Object.keys(values) as (keyof Values)[]).find((field) => field === String(path[0])),
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-4"
      onSubmit={onSubmit((input) => {
        saveSettings.mutate(input, { onSuccess: () => toast.success(t("saved")) });
      })}
    >
      <TextField
        control={form.control}
        name="holdHours"
        label={t("holdHours")}
        hint={t("holdHoursHint")}
        inputMode="numeric"
      />
      <TextField
        control={form.control}
        name="fillingFastPercent"
        label={t("fillingFastPercent")}
        hint={t("fillingFastHint")}
        inputMode="numeric"
      />
      <TextField
        control={form.control}
        name="defaultRoomCapacity"
        label={t("defaultRoomCapacity")}
        inputMode="numeric"
      />
      <FormAlert sending={saveSettings} problem={formProblem} />
      <div>
        <Button type="submit" disabled={saveSettings.isPending}>
          {saveSettings.isPending && <Spinner />}
          {saveSettings.isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

export function DepartureSettingsScreen() {
  const t = useTranslations("departures.settings");
  const tCommon = useTranslations("common");
  const settings = useDepartureSettings();
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {settings.data ? (
        <SettingsForm saved={settings.data} />
      ) : settings.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={settings.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      )}
    </div>
  );
}
