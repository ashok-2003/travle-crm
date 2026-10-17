"use client";

// The Add a task form (spec 3.5, R50): what to do, when it is due (a day and a time on the agency's clock, R25), the
// lead it is about if any (for those who may edit leads), and who it is for (with leads:assign, on no lead). Checked by
// the api's own schemas before it is sent: a task on a lead as leads.addWork's input, kind "task", which the api gives
// the lead's owner (R21); any other as tasks.add's, null meaning "for me". A time the api finds already past is said
// on the time field, where it is fixed.
import { addLeadWorkInput, type AddLeadWorkInput } from "@travel-crm/contracts/crm";
import { addTaskInput, type AddTaskInput } from "@travel-crm/contracts/tasks";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { Controller, type Control } from "react-hook-form";
import type { z } from "zod";
import { FormField } from "@/components/form-field";
import { checked, type Checked } from "@/components/forms/checked";
import { DueField } from "@/components/forms/due-field";
import { FormAlert, type Sending } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import { FieldGroup } from "@/components/ui/field";
import { useLeadOwners } from "@/leads/use-lead-owners";
import { useHolds, useMe } from "@/session/me-context";
import { LeadPicker, type PickedLead } from "./lead-picker";

/** What the form sends: a task on a lead, or one standing alone. */
export type NewTask = { on: "lead"; work: AddLeadWorkInput } | { on: null; task: AddTaskInput };

interface TaskValues {
  title: string;
  day: string;
  time: string;
  /** A user id; the member's own means "for me". */
  assignee: string;
  lead: PickedLead | null;
}

type Problem = keyof TaskValues;

/** The form's field for a place the api's schema refused. */
function fieldAt([first, second]: readonly PropertyKey[]): Problem | undefined {
  if (first === "title") return "title";
  if (first === "due") return second === "on" ? "day" : "time";
  if (first === "assigneeUserId") return "assignee";
  if (first === "leadId") return "lead";
  return undefined;
}

function toNewTask(values: TaskValues, myUserId: string): Checked<TaskValues, NewTask, Problem | "required"> {
  const due = { on: values.day, at: values.time };
  const blank = {
    ...(values.day === "" && { day: "day" as const }),
    ...(values.time === "" && { time: "time" as const }),
  };
  const check = <Input,>(parsed: z.ZodSafeParseResult<Input>) =>
    checked(parsed, values, fieldAt, (field): Problem => field, blank);
  if (values.lead !== null) {
    const result = check(
      addLeadWorkInput.safeParse({ leadId: values.lead.id, kind: "task", title: values.title, due }),
    );
    return result.ok ? { ok: true, input: { on: "lead", work: result.input } } : result;
  }
  const assigneeUserId = values.assignee === myUserId ? null : values.assignee;
  const result = check(addTaskInput.safeParse({ title: values.title, due, assigneeUserId }));
  return result.ok ? { ok: true, input: { on: null, task: result.input } } : result;
}

/** Who the task is for: the people who can work leads, the member first chosen. */
function AssigneeField({ control }: { control: Control<TaskValues> }) {
  const t = useTranslations("today.addTask");
  const me = useMe();
  const owners = useLeadOwners();
  const people = owners.data ?? [{ userId: me.user.id, name: me.user.name }];
  return (
    <SelectField
      control={control}
      name="assignee"
      label={t("assignee")}
      options={people.map((person) => ({ value: person.userId, label: person.name }))}
    />
  );
}

export function AddTaskForm({ formId, add }: { formId: string; add: Sending<NewTask> }) {
  const t = useTranslations("today.addTask");
  const me = useMe();
  const mayLink = useHolds("leads:edit");
  const mayAssign = useHolds("leads:assign");
  const { form, onSubmit, formProblem } = useCheckedForm<TaskValues, NewTask, Problem | "required">(
    {
      title: "",
      day: calendarDateIn(new Date(), me.organization.timeZone),
      time: "",
      assignee: me.user.id,
      lead: null,
    },
    (values) => toNewTask(values, me.user.id),
    (problem) => t(`problems.${problem}`),
  );
  const lead = form.watch("lead");
  const refusal = useRefusalOnField(form, add.error, { DUE_IN_THE_PAST: "time" });
  return (
    <form id={formId} noValidate onSubmit={onSubmit(add.mutate)} className="flex flex-col gap-4">
      <FieldGroup>
        <TextField control={form.control} name="title" label={t("what")} />
        <DueField control={form.control} dayName="day" timeName="time" label={t("due")} />
        {mayLink && (
          <Controller
            control={form.control}
            name="lead"
            render={({ field, fieldState }) => (
              <FormField label={t("lead")} hint={t("leadHint")} error={fieldState.error?.message}>
                {(links) => <LeadPicker links={links} value={field.value} onChange={field.onChange} />}
              </FormField>
            )}
          />
        )}
        {mayAssign && lead === null && <AssigneeField control={form.control} />}
      </FieldGroup>
      <FormAlert sending={{ error: refusal }} problem={formProblem} />
    </form>
  );
}
