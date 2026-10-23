"use client";

// The assignment rules (release 4, spec 3.1): an ordered list, tried before the mode in every mode; a rule whose
// person left or no longer works leads is marked and passed over.
import type { LeadWorker } from "@travel-crm/contracts/crm";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { newRuleKey, rulesComplete } from "./assignment-values";
import { RuleRow, type RuleDraft } from "./rule-row";

export function RulesCard({
  rules,
  onRules,
  workers,
}: {
  rules: readonly RuleDraft[];
  onRules: (rules: RuleDraft[]) => void;
  workers: readonly LeadWorker[];
}) {
  const t = useTranslations("settings.assignment.rules");
  const working = new Set(workers.map((worker) => worker.userId));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("label")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {rules.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}
        {rules.map((rule, index) => (
          <Fragment key={rule.key}>
            {index > 0 && <Separator />}
            <RuleRow
              rule={rule}
              number={index + 1}
              count={rules.length}
              workers={workers}
              personLeft={rule.assigneeUserId !== null && !working.has(rule.assigneeUserId)}
              onChange={(changed) => {
                onRules(rules.map((each) => (each.key === rule.key ? changed : each)));
              }}
              onMove={(by) => {
                const moved = [...rules];
                const [taken] = moved.splice(index, 1);
                if (taken) moved.splice(index + by, 0, taken);
                onRules(moved);
              }}
              onRemove={() => {
                onRules(rules.filter((each) => each.key !== rule.key));
              }}
            />
          </Fragment>
        ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => {
            onRules([
              ...rules,
              { key: newRuleKey(), source: null, destination: null, tripType: null, assigneeUserId: null },
            ]);
          }}
        >
          <PlusIcon aria-hidden="true" />
          {t("add")}
        </Button>
        {!rulesComplete(rules) && <p className="text-label text-muted-foreground">{t("needsCondition")}</p>}
      </CardContent>
    </Card>
  );
}
