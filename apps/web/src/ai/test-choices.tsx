"use client";

// Try it's model and temperature, for the test chat alone: the live turn's model or Gemini Flash, and the model's own
// temperature or 0.4, which only Gemini Flash takes (its private routes alone accept one). Choosing another model takes
// the temperature back to its default.
import { testAiModels, testAiTemperatures, type TestAiModel, type TestAiTemperature } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface TestChoice {
  model: TestAiModel;
  temperature: TestAiTemperature;
}

export const liveChoice: TestChoice = { model: "live", temperature: "default" };

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
  const temperatureWords = (temperature: TestAiTemperature) =>
    temperature === "default" ? t("temperatures.default") : t("temperatures.point4");
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("model")}>
          {(links) => (
            <Select
              value={choice.model}
              disabled={disabled}
              onValueChange={(value) => {
                const model = testAiModels.find((one) => one === value) ?? "live";
                onChange({ model, temperature: model === "flash" ? choice.temperature : "default" });
              }}
            >
              <SelectTrigger {...links} className="h-auto w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {testAiModels.map((model) => (
                  <SelectItem key={model} value={model} className="whitespace-normal">
                    {t(`models.${model}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("temperature")} hint={flash ? undefined : t("onlyFlash")}>
          {(links) => (
            <Select
              value={choice.temperature}
              disabled={disabled}
              onValueChange={(value) => {
                onChange({ ...choice, temperature: testAiTemperatures.find((one) => one === value) ?? "default" });
              }}
            >
              <SelectTrigger {...links} className="h-auto w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {testAiTemperatures.map((temperature) => (
                  <SelectItem
                    key={temperature}
                    value={temperature}
                    disabled={temperature !== "default" && !flash}
                    className="whitespace-normal"
                  >
                    {temperatureWords(temperature)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
      <p className="text-caption text-muted-foreground">{t("thisChatOnly")}</p>
    </div>
  );
}
