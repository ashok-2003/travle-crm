"use client";

// /reset-password: reads the token (or the error) Better Auth put in the address, then takes it out of the address
// bar (ADR 0006), so it isn't left in the history or sent on as a Referer by what the page asks for next.
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthClient } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { ResetPasswordForm } from "./reset-password-form";

export function ResetPasswordScreen({ auth }: { auth?: Pick<AuthClient, "resetPassword"> }) {
  const searchParams = useSearchParams();
  // Read once and kept: Next makes useSearchParams follow history.replaceState
  // (next/dist/client/components/app-router.js:302), so after the clean-up below the address has no token to read.
  const [token] = useState(() => (searchParams.get("error") === null ? searchParams.get("token") : null));
  useEffect(() => {
    if (window.location.search !== "") window.history.replaceState(null, "", routes.resetPassword);
  }, []);
  return <ResetPasswordForm token={token} {...(auth ? { auth } : {})} />;
}
