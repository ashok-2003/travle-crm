// /sign-in: by email, or by organization code and username (spec 6.3).
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInScreen } from "@/account/sign-in-screen";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  // The screen reads ?next=, which is only known in the browser.
  return (
    <Suspense>
      <SignInScreen />
    </Suspense>
  );
}
