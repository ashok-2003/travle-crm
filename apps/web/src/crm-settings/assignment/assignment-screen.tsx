"use client";

// Lead assignment (release C, spec 3.2): who the leads that arrive by themselves go to. The rules come first, in order;
// then the mode (the Owner, turns, or fewest open leads) among the people ticked. Saved whole, for roles that manage
// settings; a person away shows when they are back.
import type { AssignmentMode, AssignmentSettings, LeadWorker } from "@travel-crm/contracts/crm";
import { assignmentModes } from "@travel-crm/contracts/crm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";
import { useLeadOwners } from "@/leads/use-lead-owners";
import { RuleRow, type RuleDraft } from "./rule-row";

let nextKey = 0;
const newKey = () => `rule-${String((nextKey += 1))}`;

function draftOf(settings: AssignmentSettings) {
  return {
    mode: settings.mode,
    pool: new Set(settings.pool.map((member) => member.userId)),
    rules: settings.rules.map((rule): RuleDraft => ({
      key: newKey(),
      source: rule.source,
      destination: rule.destinationId === null ? null : { id: rule.destinationId, name: rule.destinationName ?? "" },
      tripType: rule.tripType,
      assigneeUserId: rule.assigneeUserId,
    })),
  };
}

function AssignmentForm({ settings, workers }: { settings: AssignmentSettings; workers: readonly LeadWorker[] }) {
  const t = useTranslations("settings.assignment");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { timeZone } = useMe().organization;
  const write = useWriteAccess("change");
  const [draft, setDraft] = useState(() => draftOf(settings));
  const save = useMutation(
    trpc.assignment.save.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.assignment.pathKey() });
        toast.success(t("saved"));
      },
    }),
  );
  const awayOf = new Map(settings.pool.map((member) => [member.userId, member.awayUntil]));
  const complete = draft.rules.every(
    (rule) =>
      rule.assigneeUserId !== null && (rule.source !== null || rule.destination !== null || rule.tripType !== null),
  );
  const setRules = (rules: RuleDraft[]) => {
    setDraft({ ...draft, rules });
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("rules.label")}</CardTitle>
          <CardDescription>{t("rules.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {draft.rules.length === 0 && <p className="text-muted-foreground">{t("rules.empty")}</p>}
          {draft.rules.map((rule, index) => (
            <div key={rule.key} className="flex flex-col gap-5">
              {index > 0 && <Separator />}
              <RuleRow
                rule={rule}
                number={index + 1}
                count={draft.rules.length}
                workers={workers}
                onChange={(changed) => {
                  setRules(draft.rules.map((each) => (each.key === rule.key ? changed : each)));
                }}
                onMove={(by) => {
                  const moved = [...draft.rules];
                  const [taken] = moved.splice(index, 1);
                  if (taken) moved.splice(index + by, 0, taken);
                  setRules(moved);
                }}
                onRemove={() => {
                  setRules(draft.rules.filter((each) => each.key !== rule.key));
                }}
              />
            </div>
          ))}
          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              setRules([
                ...draft.rules,
                { key: newKey(), source: null, destination: null, tripType: null, assigneeUserId: null },
              ]);
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t("rules.add")}
          </Button>
          {!complete && <p className="text-label text-muted-foreground">{t("rules.needsCondition")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle id="mode-heading">{t("mode.label")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-labelledby="mode-heading"
            value={draft.mode}
            onValueChange={(value) => {
              const mode = assignmentModes.find((each): each is AssignmentMode => each === value);
              if (mode) setDraft({ ...draft, mode });
            }}
            className="gap-4"
          >
            {assignmentModes.map((mode) => (
              <div key={mode} className="flex items-start gap-3">
                <RadioGroupItem value={mode} id={`mode-${mode}`} className="mt-0.5" />
                <Label htmlFor={`mode-${mode}`} className="flex flex-col items-start gap-1 font-normal">
                  <span className="font-medium">{t(`mode.${mode}`)}</span>
                  <span className="text-label text-muted-foreground">{t(`mode.${mode}Hint`)}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pool.label")}</CardTitle>
          <CardDescription>{t("pool.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {workers.map((worker) => {
            const away = awayOf.get(worker.userId);
            const awayNow = away !== undefined && away !== null && new Date(away) > new Date();
            return (
              <div key={worker.userId} className="flex items-center gap-3">
                <Checkbox
                  id={`pool-${worker.userId}`}
                  checked={draft.pool.has(worker.userId)}
                  onCheckedChange={(checked) => {
                    const pool = new Set(draft.pool);
                    if (checked === true) pool.add(worker.userId);
                    else pool.delete(worker.userId);
                    setDraft({ ...draft, pool });
                  }}
                />
                <Label htmlFor={`pool-${worker.userId}`} className="flex flex-wrap gap-x-2 font-normal">
                  {worker.name}
                  {awayNow && (
                    <span className="text-muted-foreground">
                      {t("pool.away", { day: formatDay(new Date(away), { timeZone }) })}
                    </span>
                  )}
                </Label>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {save.isError && <RefusalAlert error={save.error} />}
      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={!complete || save.isPending || !write.allowed}
          aria-describedby={write.hint === null ? undefined : "assignment-write-hint"}
          onClick={() => {
            save.mutate({
              mode: draft.mode,
              slowReplyMinutes: settings.slowReplyMinutes,
              pool: [...draft.pool],
              rules: draft.rules.flatMap((rule) =>
                rule.assigneeUserId === null
                  ? []
                  : [
                      {
                        source: rule.source,
                        destinationId: rule.destination?.id ?? null,
                        tripType: rule.tripType,
                        assigneeUserId: rule.assigneeUserId,
                      },
                    ],
              ),
            });
          }}
        >
          {save.isPending && <Spinner />}
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <WriteHint id="assignment-write-hint" hint={write.hint} visible />
      </div>
    </div>
  );
}

export function AssignmentScreen() {
  const t = useTranslations("settings.assignment");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const settings = useQuery(trpc.assignment.get.queryOptions());
  const owners = useLeadOwners();
  const body = () => {
    if (settings.isError || owners.isError) {
      const failed = settings.isError ? settings : owners;
      return (
        <ErrorState
          message={settings.isError ? t("loadFailed") : t("pool.ownersFailed")}
          error={failed.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void failed.refetch()}
        />
      );
    }
    if (settings.data === undefined || owners.data === undefined) return <LoadingRows rows={5} shape="twoLines" />;
    return <AssignmentForm settings={settings.data} workers={owners.data} />;
  };
  return (
    <div className="flex flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {body()}
    </div>
  );
}
