"use client";

// Setup step "Agent name and tone": what the agent calls itself and how it sounds.
import { saveAgentBasicsInput, type AgentBasics, type SaveAgentBasicsInput } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useAgentBasics, useSaveBasics } from "./use-setup-steps";

interface BasicsValues {
  agentName: string;
  tone: string;
}

type Problem = "agentName" | "tone" | "required";

const toBasicsInput = (values: BasicsValues) =>
  checked(
    saveAgentBasicsInput.safeParse(values),
    values,
    ([key]) => (key === "agentName" || key === "tone" ? key : undefined),
    (field): Problem => field,
  );

function BasicsForm({ saved }: { saved: AgentBasics }) {
  const t = useTranslations("aiAgent.setup.basics");
  const hintId = `${useId()}-write`;
  const access = useWriteAccess("change");
  const agency = useMe().organization.name;
  const save = useSaveBasics();
  const { form, onSubmit, formProblem } = useCheckedForm<BasicsValues, SaveAgentBasicsInput, Problem>(
    // The first agent's "enthusiastic" is not on offer: it shows as the nearest, Friendly, until a tone is chosen.
    { agentName: saved.agentName, tone: saved.tone === "professional" ? "professional" : "friendly" },
    toBasicsInput,
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form
      noValidate
      onSubmit={onSubmit((input) => {
        save.mutate(input, { onSuccess: () => toast.success(t("saved")) });
      })}
      className="flex flex-col gap-4"
    >
      <FieldGroup>
        <TextField
          control={form.control}
          name="agentName"
          label={t("agentName")}
          placeholder={t("namePlaceholder", { agency })}
        />
        <ChoiceField
          control={form.control}
          name="tone"
          legend={t("tone")}
          inline
          options={[
            { value: "friendly", label: t("friendly") },
            { value: "professional", label: t("professional") },
          ]}
        />
      </FieldGroup>
      {formProblem !== undefined && <p role="alert">{formProblem}</p>}
      <RefusalAlert error={save.error} />
      <div>
        <Button
          type="submit"
          disabled={!access.allowed || save.isPending}
          aria-describedby={access.allowed ? undefined : hintId}
        >
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <WriteHint id={hintId} hint={access.hint} />
      </div>
    </form>
  );
}

export function BasicsStepEditor() {
  const t = useTranslations("aiAgent.setup.basics");
  const basics = useAgentBasics();
  if (basics.data !== undefined) return <BasicsForm saved={basics.data} />;
  return basics.isError ? (
    <LoadFailedAlert message={t("loadFailed")} error={basics.error} onRetry={() => void basics.refetch()} />
  ) : (
    <LoadingRows shape="twoLines" label={t("loading")} />
  );
}
