// /two-factor-setup: turning on two-factor sign-in with an authenticator app.
import type { Metadata } from "next";
import { TwoFactorSetupScreen } from "@/account/two-factor-setup-screen";

export const metadata: Metadata = { title: "Set up two-factor sign-in" };

export default function TwoFactorSetupPage() {
  return <TwoFactorSetupScreen />;
}
