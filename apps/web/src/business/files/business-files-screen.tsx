"use client";

// The business files screen: the agency's own papers (a GST certificate, a PAN card, licences, a cancelled cheque),
// kept on its organization record, the one record the api lets settings managers attach files to.
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { AttachmentsPanel } from "@/files/attachments-panel";
import { useMe } from "@/session/me-context";

export function BusinessFilesScreen() {
  const t = useTranslations("business.files");
  const me = useMe();
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <div className="flex max-w-[65ch] flex-col gap-2">
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <AttachmentsPanel
        record={{ recordType: "organization", recordId: me.organization.id }}
        emptyMessage={t("empty")}
      />
    </div>
  );
}
