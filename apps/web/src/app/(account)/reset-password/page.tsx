// /reset-password: where the emailed reset link leads, with ?token= or ?error=INVALID_TOKEN.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordScreen } from "@/account/reset-password-screen";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
