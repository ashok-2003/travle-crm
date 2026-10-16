"use client";

// What an admin gives a new or reset person so they can sign in: the organization code and username (or email), and
// the temporary password, each with a copy button. Shown once; nobody can read the password again later.
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { CopyButton } from "@/components/copy-button";

export function Handover({
  name,
  organizationCode,
  signInName,
  password,
}: {
  name: string;
  organizationCode: string | null;
  signInName: string | null;
  password: string;
}) {
  const t = useTranslations("staff");
  const rows = [
    ...(organizationCode === null ? [] : [{ label: t("create.organizationCode"), value: organizationCode }]),
    ...(signInName === null ? [] : [{ label: t("columns.signIn"), value: signInName }]),
    { label: t("create.temporaryPassword"), value: password },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p>{t("create.handover", { name })}</p>
      <Details
        rows={rows.map(({ label, value }) => ({
          label,
          value: <span className="numbers">{value}</span>,
          action: <CopyButton value={value} label={`${t("create.copy")} ${label}`} />,
        }))}
      />
    </div>
  );
}
