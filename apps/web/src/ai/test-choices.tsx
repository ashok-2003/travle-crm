"use client";

// Try it's agent, model, temperature and prompt, for the test chat alone: the current agent or the new one (ruling 7:
// each has its own procedure, and choosing the other empties the chat), the live turn's model or Gemini Flash, the
// model's own temperature or 0.4, which only Gemini Flash takes (its private routes alone accept one), and, for the new
// agent alone, its live prompt or the draft being edited. Choosing another model takes the temperature back to its
// default.
import {
  naturalTestPrompts,
  testAiModels,
  testAiTemperatures,
  type NaturalTestPrompt,
  type TestAiModel,
  type TestAiTemperature,
} from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** The agent a test chat talks to: the current (lite) one, or the new natural one. */
export const testAgents = ["current", "natural"] as const;
export type TestAgent = (typeof testAgents)[number];

export interface TestChoice {
  agent: TestAgent;
  model: TestAiModel;
  temperature: TestAiTemperature;
  /** The new agent's prompt; the current agent has none to choose. */
  prompt: NaturalTestPrompt;
}

export const liveChoice: TestChoice = { agent: "current", model: "live", temperature: "default", prompt: "live" };

/** One labelled choice: the registry Select over a fixed list, each option in words. */
function ChoiceSelect<Value extends string>({
  label,
  hint,
  value,
  values,
  wordsOf,
  isOff = () => false,
  disabled,
  onChoose,
}: {
  label: string;
  hint?: string | undefined;
  value: Value;
  values: readonly Value[];
  wordsOf: (value: Value) => string;
  isOff?: (value: Value) => boolean;
  disabled: boolean;
  onChoose: (value: Value) => void;
}) {
  return (
    <FormField label={label} hint={hint}>
      {(links) => (
        <Select
          value={value}
          disabled={disabled}
          onValueChange={(chosen) => {
            const found = values.find((one) => one === chosen);
            if (found !== undefined) onChoose(found);
          }}
        >
          <SelectTrigger {...links} className="h-auto w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {values.map((one) => (
              <SelectItem key={one} value={one} disabled={isOff(one)} className="whitespace-normal">
                {wordsOf(one)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export function TestChoices({
  choice,
  onChange,
  disabled,
}: {
  choice: TestChoice;
  onChange: (next: TestChoice) => void;
  disabled: boolean;
}) {
  const t = useTranslations("ai.test.choices");
  const flash = choice.model === "flash";
  const natural = choice.agent === "natural";
  return (
    <div className="flex flex-col gap-2">
      <div className={cn("grid gap-3", natural ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
        <ChoiceSelect
          label={t("agent")}
          value={choice.agent}
          values={testAgents}
          wordsOf={(agent) => t(`agents.${agent}`)}
          disabled={disabled}
          onChoose={(agent) => {
            onChange({ ...choice, agent });
          }}
        />
        <ChoiceSelect
          label={t("model")}
          value={choice.model}
          values={testAiModels}
          wordsOf={(model) => t(`models.${model}`)}
          disabled={disabled}
          onChoose={(model) => {
            onChange({ ...choice, model, temperature: model === "flash" ? choice.temperature : "default" });
          }}
        />
        <ChoiceSelect
          label={t("temperature")}
          hint={flash ? undefined : t("onlyFlash")}
          value={choice.temperature}
          values={testAiTemperatures}
          wordsOf={(temperature) => (temperature === "default" ? t("temperatures.default") : t("temperatures.point4"))}
          isOff={(temperature) => temperature !== "default" && !flash}
          disabled={disabled}
          onChoose={(temperature) => {
            onChange({ ...choice, temperature });
          }}
        />
        {natural && (
          <ChoiceSelect
            label={t("prompt")}
            hint={t("draftHint")}
            value={choice.prompt}
            values={naturalTestPrompts}
            wordsOf={(prompt) => t(`prompts.${prompt}`)}
            disabled={disabled}
            onChoose={(prompt) => {
              onChange({ ...choice, prompt });
            }}
          />
        )}
      </div>
      <p className="text-caption text-muted-foreground">{t("thisChatOnly")}</p>
    </div>
  );
}
