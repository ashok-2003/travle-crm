// /sign-in/two-factor: the code after the password, for people with two-factor sign-in.
import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoFactorChallenge } from "@/account/two-factor-challenge";

export const metadata: Metadata = { title: "Enter your code" };

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorChallenge />
    </Suspense>
  );
}
