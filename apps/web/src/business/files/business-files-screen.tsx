"use client";

// The business files screen: the agency's own papers (a GST certificate, a PAN card, licences, a cancelled cheque),
// kept on its organization record, the one record the api lets settings managers attach files to.
import { useTranslations } from "next-intl";
import { BackToSettings } from "@/components/back-to-settings";
import { PageHeader } from "@/components/page-header";
import { AttachmentsPanel } from "@/files/attachments-panel";
import { useMe } from "@/session/me-context";

export function BusinessFilesScreen() {
  const t = useTranslations("business.files");
  const me = useMe();
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      <AttachmentsPanel
        record={{ recordType: "organization", recordId: me.organization.id }}
        emptyMessage={t("empty")}
      />
    </div>
  );
}
