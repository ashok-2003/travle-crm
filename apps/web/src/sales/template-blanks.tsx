"use client";

// Choosing an automatic WhatsApp (sales execution): one of the agency's approved templates, and for each of its blanks
// what fills it for every lead (the customer's name, the destination, their salesperson...) or fixed words of the
// agency's own. The preview shows it with a made-up customer.
import { markersOf, type TemplateSummary } from "@travel-crm/contracts/inbox";
import type { TemplateField } from "@travel-crm/contracts/sales";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CUSTOM = "custom";

export function TemplateBlanks({
  label,
  templates,
  templateId,
  params,
  fields,
  onChange,
  disabled,
}: {
  label: string;
  templates: readonly TemplateSummary[];
  templateId: string | null;
  params: readonly string[];
  /** The fields a blank may take here: a payment reminder adds the amount, the day and the link. */
  fields: readonly TemplateField[];
  onChange: (templateId: string | null, params: string[]) => void;
  disabled: boolean;
}) {
  const t = useTranslations("sales.blanks");
  const id = useId();
  const template = templates.find((candidate) => candidate.id === templateId);
  const markers = template === undefined ? [] : markersOf(template.body);
  const sample: Record<TemplateField, string> = {
    name: t("samples.name"),
    destination: t("samples.destination"),
    when: t("samples.when"),
    agent: t("samples.agent"),
    agency: t("samples.agency"),
    amount: t("samples.amount"),
    due: t("samples.due"),
    link: t("samples.link"),
  };
  const isField = (param: string): param is TemplateField => Object.hasOwn(sample, param);
  const shown = (param: string | undefined) =>
    param === undefined ? "" : param.startsWith("text:") ? param.slice(5) : isField(param) ? sample[param] : "";
  const choose = (nextId: string) => {
    const next = templates.find((candidate) => candidate.id === nextId);
    // Each blank starts as the customer's name, then the destination: what most greetings ask for.
    const guess = (index: number): string => (index === 0 ? "name" : (fields[index] ?? "agency"));
    onChange(nextId, next === undefined ? [] : markersOf(next.body).map((_, index) => guess(index)));
  };
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor={`${id}-template`}>{label}</FieldLabel>
        <Select value={templateId ?? ""} onValueChange={choose} disabled={disabled}>
          <SelectTrigger id={`${id}-template`} className="w-full">
            <SelectValue placeholder={t("choose")} />
          </SelectTrigger>
          <SelectContent>
            {templates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {templates.length === 0 && <p className="text-caption text-muted-foreground">{t("noTemplates")}</p>}
      {markers.map((number, index) => {
        const param = params[index] ?? "name";
        const custom = param.startsWith("text:");
        return (
          <div key={number} className="grid gap-2 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-${String(number)}`}>{t("blank", { number })}</FieldLabel>
              <Select
                value={custom ? CUSTOM : param}
                disabled={disabled}
                onValueChange={(value) => {
                  const next = [...params];
                  next[index] = value === CUSTOM ? "text:" : value;
                  onChange(templateId, next);
                }}
              >
                <SelectTrigger id={`${id}-${String(number)}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {t(`fields.${field}`)}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>{t("fields.custom")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {custom && (
              <Field>
                <FieldLabel htmlFor={`${id}-${String(number)}-text`}>{t("words")}</FieldLabel>
                <Input
                  id={`${id}-${String(number)}-text`}
                  value={param.slice(5)}
                  maxLength={190}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = [...params];
                    next[index] = `text:${event.target.value}`;
                    onChange(templateId, next);
                  }}
                />
              </Field>
            )}
          </div>
        );
      })}
      {template !== undefined && (
        <p className="rounded-md bg-muted p-3 whitespace-pre-wrap" dir="auto" aria-label={t("preview")}>
          {template.body.replace(
            /\{\{(\d+)\}\}/g,
            (marker, index: string) => shown(params[Number(index) - 1]) || marker,
          )}
        </p>
      )}
    </div>
  );
}
