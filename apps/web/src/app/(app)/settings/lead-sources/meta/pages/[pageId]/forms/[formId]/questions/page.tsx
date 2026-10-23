// /settings/lead-sources/meta/pages/<pageId>/forms/<formId>/questions: matching a lead form's questions to our fields.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FormMatchingScreen } from "@/lead-sources/meta/form/form-matching-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metaLeads");
  return { title: t("list.heading") };
}

export default async function FormPage({
  params,
}: PageProps<"/settings/lead-sources/meta/pages/[pageId]/forms/[formId]/questions">) {
  const { pageId, formId } = await params;
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <FormMatchingScreen pageId={pageId} formId={formId} mode="questions" />
      </RequirePermission>
    </RequirePermission>
  );
}
