// /account: the signed-in person's own details, password and two-factor sign-in.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountScreen } from "@/account/account-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("account.title") };
}

export default function AccountPage() {
  return <AccountScreen />;
}
