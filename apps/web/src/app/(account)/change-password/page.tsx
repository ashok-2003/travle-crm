// /change-password: replacing a temporary password at first sign-in, or changing one's own.
import type { Metadata } from "next";
import { ChangePasswordScreen } from "@/account/change-password-screen";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ChangePasswordPage() {
  return <ChangePasswordScreen />;
}
