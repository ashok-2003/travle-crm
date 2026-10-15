"use client";

// What an admin gives a new or reset person so they can sign in: the organization code and username (or email), and
// the temporary password, each with a copy button. Shown once; nobody can read the password again later.
import { useTranslations } from "next-intl";
import { Detail } from "@/components/detail";
import { ItemGroup } from "@/components/ui/item";
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
      <ItemGroup>
        {rows.map((row) => (
          <Detail
            key={row.label}
            label={row.label}
            action={<CopyButton value={row.value} label={`${t("create.copy")} ${row.label}`} />}
          >
            <span className="numbers">{row.value}</span>
          </Detail>
        ))}
      </ItemGroup>
    </div>
  );
}
