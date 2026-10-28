"use client";

// Inviting companies in bulk (the invite program): the rows pasted from a sheet (Company, Owner, Phone, Email, City),
// checked and shown before anything is made; the plan they start on, its billing cycle, the free days and the GST state
// their profile starts with. Only the rows that read are invited; each gets its own link at once.
import { gstStates } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { readInviteRows } from "./invite-rows";
import { useCreateInvites, usePlansForSale } from "./use-growth";

const SHOWN_ROWS = 50;

export function AddInvitesDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("consoleGrowth.add");
  const create = useCreateInvites();
  const plans = usePlansForSale();
  const [text, setText] = useState("");
  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [trialDays, setTrialDays] = useState("30");
  const [state, setState] = useState("07");
  const ids = { rows: useId(), plan: useId(), days: useId(), state: useId() };
  const formId = useId();
  const rows = useMemo(() => readInviteRows(text), [text]);
  const good = rows.flatMap((one) => (one.row === null ? [] : [one.row]));
  const forSale = (plans.data ?? []).filter((plan) => plan.forSale && !plan.archived);
  const chosenPlan = forSale.find((plan) => plan.id === planId) ?? forSale[0];
  const days = Number(trialDays);
  const ready = good.length > 0 && chosenPlan !== undefined && Number.isInteger(days) && days >= 1 && days <= 365;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={create.isPending}
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={t("description")}
      footer={
        <Button type="submit" form={formId} disabled={!ready || create.isPending}>
          {create.isPending && <Spinner aria-hidden="true" />}
          {t("create", { count: good.length })}
        </Button>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          create.mutate(
            {
              rows: good,
              planId: chosenPlan.id,
              billingCycle: cycle,
              trialDays: days,
              gstStateCode: gstStates.find((one) => one.code === state)?.code ?? "07",
            },
            {
              onSuccess: (result) => {
                toast.success(t("created", { count: result.created }));
                setText("");
                onOpenChange(false);
              },
            },
          );
        }}
      >
        <Field>
          <FieldLabel htmlFor={ids.rows}>{t("rows")}</FieldLabel>
          <Textarea
            id={ids.rows}
            rows={7}
            value={text}
            placeholder={t("rowsPlaceholder")}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
          <FieldDescription>{t("rowsHint")}</FieldDescription>
        </Field>
        {rows.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-label">{t("read", { good: good.length, bad: rows.length - good.length })}</p>
            <div className="max-h-64 overflow-auto rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.company")}</TableHead>
                    <TableHead>{t("columns.owner")}</TableHead>
                    <TableHead>{t("columns.phone")}</TableHead>
                    <TableHead>{t("columns.check")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, SHOWN_ROWS).map((one) => (
                    <TableRow key={one.line}>
                      <TableCell>{one.row?.companyName ?? t("line", { line: one.line })}</TableCell>
                      <TableCell>{one.row?.ownerName ?? ""}</TableCell>
                      <TableCell className="numbers">{one.row?.ownerPhone ?? ""}</TableCell>
                      <TableCell>
                        {one.problem === null ? (
                          <StatusBadge tone="good">{t("ok")}</StatusBadge>
                        ) : (
                          <span className="text-caption text-status-bad-ink">{one.problem}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.plan}>{t("plan")}</FieldLabel>
            <Select value={chosenPlan?.id ?? ""} onValueChange={setPlanId}>
              <SelectTrigger id={ids.plan} className="w-full">
                <SelectValue placeholder={t("planPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {forSale.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.days}>{t("trialDays")}</FieldLabel>
            <Input
              id={ids.days}
              inputMode="numeric"
              value={trialDays}
              onChange={(event) => {
                setTrialDays(event.target.value.replace(/\D/g, "").slice(0, 3));
              }}
            />
          </Field>
        </div>
        <ChoiceGroup
          legend={t("cycle")}
          inline
          value={cycle}
          onChange={(chosen) => {
            setCycle(chosen === "yearly" ? "yearly" : "monthly");
          }}
          options={[
            { value: "monthly", label: t("monthly") },
            { value: "yearly", label: t("yearly") },
          ]}
        />
        <Field>
          <FieldLabel htmlFor={ids.state}>{t("gstState")}</FieldLabel>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger id={ids.state} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gstStates.map((one) => (
                <SelectItem key={one.code} value={one.code}>
                  {one.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t("gstStateHint")}</FieldDescription>
        </Field>
        <RefusalAlert error={create.error} />
      </form>
    </ResponsiveDialog>
  );
}
