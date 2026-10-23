"use client";

// One assignment rule being edited: its conditions (a source, a destination, a trip type; "Any" for each left open) and
// the person a matching lead goes to, with buttons to move it up or down the order or remove it. A rule whose person
// left is marked and passed over.
import { leadSources, tripTypes, type LeadSource, type LeadWorker, type TripType } from "@travel-crm/contracts/crm";
import type { Destination } from "@travel-crm/contracts/catalog";
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DestinationPicker } from "../destination-picker";

/** A rule as the screen holds it: a key of its own, and its destination with its name. */
export interface RuleDraft {
  key: string;
  source: LeadSource | null;
  destination: Destination | null;
  tripType: TripType | null;
  assigneeUserId: string | null;
}

const ANY = "any";

export function RuleRow({
  rule,
  number,
  count,
  workers,
  personLeft,
  onChange,
  onMove,
  onRemove,
}: {
  rule: RuleDraft;
  /** Its place in the order, from 1. */
  number: number;
  count: number;
  workers: readonly LeadWorker[];
  /** Its person no longer works leads: the rule is passed over. */
  personLeft: boolean;
  onChange: (rule: RuleDraft) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("settings.assignment.rules");
  const tLeads = useTranslations("leads");
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 flex items-center gap-2 font-medium">
        {t("rule", { number })}
        {personLeft && <StatusBadge tone="attention">{t("personLeft")}</StatusBadge>}
      </legend>
      {personLeft && <p className="text-label text-muted-foreground">{t("personLeftHint")}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label={t("source")}>
          {(links) => (
            <Select
              value={rule.source ?? ANY}
              onValueChange={(value) => {
                onChange({ ...rule, source: leadSources.find((source) => source === value) ?? null });
              }}
            >
              <SelectTrigger {...links}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("any")}</SelectItem>
                {leadSources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {tLeads(`sources.${source}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("destination")}>
          {(links) => (
            <DestinationPicker
              links={links}
              value={rule.destination}
              onChange={(destination) => {
                onChange({ ...rule, destination });
              }}
            />
          )}
        </FormField>
        <FormField label={t("tripType")}>
          {(links) => (
            <Select
              value={rule.tripType ?? ANY}
              onValueChange={(value) => {
                onChange({ ...rule, tripType: tripTypes.find((type) => type === value) ?? null });
              }}
            >
              <SelectTrigger {...links}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("any")}</SelectItem>
                {tripTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {tLeads(`tripTypes.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("person")}>
          {(links) => (
            <Select
              value={rule.assigneeUserId ?? ""}
              onValueChange={(value) => {
                onChange({ ...rule, assigneeUserId: value });
              }}
            >
              <SelectTrigger {...links}>
                <SelectValue placeholder={t("choosePerson")} />
              </SelectTrigger>
              <SelectContent>
                {workers.map((worker) => (
                  <SelectItem key={worker.userId} value={worker.userId}>
                    {worker.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("moveUp", { number })}
          disabled={number === 1}
          onClick={() => {
            onMove(-1);
          }}
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("moveDown", { number })}
          disabled={number === count}
          onClick={() => {
            onMove(1);
          }}
        >
          <ArrowDownIcon aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={t("remove", { number })} onClick={onRemove}>
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
    </fieldset>
  );
}
