"use client";

// What an admin gives a new or reset person so they can sign in: the organization code and username (or email), and
// the temporary password, each with a copy button. Shown once; nobody can read the password again later.
import { useTranslations } from "next-intl";
import { CopyButton } from "../copy-button";

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
      <dl className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <dt className="w-40 text-label text-muted-foreground">{row.label}</dt>
            <dd className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <span className="numbers break-all">{row.value}</span>
              <CopyButton value={row.value} label={`${t("create.copy")} ${row.label}`} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
