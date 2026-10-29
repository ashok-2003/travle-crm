// /sign-in: by email, or by organization code and username (spec 6.3).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInScreen } from "@/account/sign-in-screen";
import { WakeOnOpen } from "@/account/wake-on-open";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("signIn.title") };
}

export default function SignInPage() {
  // The screen reads ?next= only when someone signs in, so the form is in the prerendered page and paints at once.
  return (
    <>
      <WakeOnOpen />
      <SignInScreen />
    </>
  );
}
