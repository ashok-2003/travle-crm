"use client";

// The assignment settings form (release 4): the mode and its pool, the rules, and the working hours and reply time,
// saved whole by roles that manage settings. The plain fields are a checked react-hook-form; the pool, the days and the
// rules are the screen's own state, checked with them by the api's schema.
import type { AssignmentSettings, LeadWorker, SaveAssignmentInput } from "@travel-crm/contracts/crm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useMe } from "@/session/me-context";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";
import {
  extrasOf,
  rulesComplete,
  toSaveInput,
  valuesOf,
  type AssignmentExtras,
  type AssignmentProblem,
  type AssignmentValues,
} from "./assignment-values";
import { HoursCard } from "./hours-card";
import { ModeCard } from "./mode-card";
import { RulesCard } from "./rules-card";

export function AssignmentForm({
  settings,
  workers,
}: {
  settings: AssignmentSettings;
  workers: readonly LeadWorker[];
}) {
  const t = useTranslations("settings.assignment");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { timeZone } = useMe().organization;
  const write = useWriteAccess("change");
  const [extras, setExtras] = useState<AssignmentExtras>(() => extrasOf(settings));
  const { form, onSubmit } = useCheckedForm<AssignmentValues, SaveAssignmentInput, AssignmentProblem>(
    valuesOf(settings),
    (values) => toSaveInput(values, extras),
    (problem) => t(`problems.${problem}`),
  );
  const save = useMutation(
    trpc.assignment.save.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.assignment.pathKey() });
        toast.success(t("saved"));
      },
    }),
  );
  const mode = useWatch({ control: form.control, name: "mode" });
  const slowReply = useWatch({ control: form.control, name: "slowReply" });
  const awayOf = new Map(settings.pool.map((member) => [member.userId, member.awayUntil]));

  return (
    <form noValidate onSubmit={onSubmit(save.mutate)} className="flex max-w-[720px] flex-col gap-6">
      <RulesCard
        rules={extras.rules}
        onRules={(rules) => {
          setExtras({ ...extras, rules });
        }}
        workers={workers}
      />
      <ModeCard
        mode={mode}
        onMode={(next) => {
          form.setValue("mode", next);
        }}
        pool={extras.pool}
        onPool={(pool) => {
          setExtras({ ...extras, pool });
        }}
        workers={workers}
        awayOf={awayOf}
        timeZone={timeZone}
      />
      <HoursCard
        control={form.control}
        workdays={extras.workdays}
        onWorkdays={(workdays) => {
          setExtras({ ...extras, workdays });
        }}
        slowReply={slowReply}
        timeZone={timeZone}
      />
      {save.isError && <RefusalAlert error={save.error} />}
      <div className="flex flex-col items-start gap-2">
        <Button
          type="submit"
          disabled={!rulesComplete(extras.rules) || save.isPending || !write.allowed}
          aria-describedby={write.hint === null ? undefined : "assignment-write-hint"}
        >
          {save.isPending && <Spinner />}
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <WriteHint id="assignment-write-hint" hint={write.hint} visible />
      </div>
    </form>
  );
}
