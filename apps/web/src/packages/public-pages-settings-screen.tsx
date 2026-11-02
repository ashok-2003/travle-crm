"use client";

// /settings/public-pages (release 7b): the switch for the agency's public package pages (off until the agency decides), a few
// words about the agency, and its Instagram page. A package's page is published on the package itself.
import { savePublicPageSettingsInput, type PublicPageSettings } from "@travel-crm/contracts/package-pages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { FormAlert } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { NoteField } from "@/leads/form/note-field";
import { useWriteAccess } from "@/subscription/write-access";

interface Values {
  enabled: string;
  about: string;
  instagramUrl: string;
}
type Problem = "required" | "invalid" | "https";

function SettingsForm({ saved }: { saved: PublicPageSettings }) {
  const t = useTranslations("packages.settings");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const access = useWriteAccess("change");
  const save = useMutation(
    trpc.publicPages.save.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.publicPages.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.packages.pathKey() }),
        ]),
    }),
  );
  const { form, onSubmit, formProblem } = useCheckedForm<Values, Parameters<typeof save.mutate>[0], Problem>(
    { enabled: saved.enabled ? "on" : "off", about: saved.about, instagramUrl: saved.instagramUrl },
    (values) =>
      checked(
        savePublicPageSettingsInput.safeParse({
          enabled: values.enabled === "on",
          about: values.about,
          instagramUrl: values.instagramUrl.trim(),
        }),
        values,
        (path) => (path[0] === "about" || path[0] === "instagramUrl" ? path[0] : undefined),
        (field) => (field === "instagramUrl" ? "https" : "invalid"),
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <Card className="max-w-[720px]">
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={onSubmit((input) => {
            save.mutate(input, { onSuccess: () => toast.success(t("saved")) });
          })}
        >
          <ChoiceField
            control={form.control}
            name="enabled"
            legend={t("enabled")}
            options={[
              { value: "off", label: t("off"), description: t("offHint") },
              { value: "on", label: t("on"), description: t("onHint") },
            ]}
          />
          <NoteField
            control={form.control}
            name="about"
            label={t("about")}
            hint={t("aboutHint")}
            disabled={save.isPending}
          />
          <TextField
            control={form.control}
            name="instagramUrl"
            label={t("instagram")}
            hint={t("instagramHint")}
            type="url"
            autoCapitalize="none"
            spellCheck={false}
            disabled={save.isPending}
          />
          <FormAlert sending={save} problem={formProblem} />
          <Button type="submit" className="self-start" disabled={save.isPending || !access.allowed}>
            {save.isPending && <Spinner aria-hidden="true" />}
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PublicPagesSettingsScreen() {
  const t = useTranslations("packages.settings");
  const trpc = useTRPC();
  const settings = useQuery(trpc.publicPages.settings.queryOptions());
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {settings.data ? (
        <SettingsForm saved={settings.data} />
      ) : settings.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={settings.error}
          retryLabel={t("retry")}
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      )}
    </div>
  );
}
