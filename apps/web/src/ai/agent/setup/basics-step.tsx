"use client";

// Setup step "Agent name": what the agent calls itself. The stored tone is sent back as it was loaded.
import { saveAgentBasicsInput, type AgentBasics, type SaveAgentBasicsInput } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { checked } from "@/components/forms/checked";
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
}

type Problem = "agentName" | "required";

// The tone is no longer asked for: the saved one goes back unchanged. The input refuses the first agent's
// "enthusiastic", so that one goes as the nearest, Friendly.
const toBasicsInput = (tone: AgentBasics["tone"]) => (values: BasicsValues) =>
  checked(
    saveAgentBasicsInput.safeParse({ agentName: values.agentName, tone: tone === "enthusiastic" ? "friendly" : tone }),
    values,
    ([key]) => (key === "agentName" ? key : undefined),
    (field): Problem => field,
  );

function BasicsForm({ saved }: { saved: AgentBasics }) {
  const t = useTranslations("aiAgent.setup.basics");
  const hintId = `${useId()}-write`;
  const access = useWriteAccess("change");
  const agency = useMe().organization.name;
  const save = useSaveBasics();
  const { form, onSubmit, formProblem } = useCheckedForm<BasicsValues, SaveAgentBasicsInput, Problem>(
    { agentName: saved.agentName },
    toBasicsInput(saved.tone),
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
