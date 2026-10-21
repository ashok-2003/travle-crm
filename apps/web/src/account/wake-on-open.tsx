"use client";

// Starts waking a sleeping api as the sign-in page opens, so it is up by the time the person has typed.
import { useEffect } from "react";
import { authClient, type AuthClient } from "@/data/auth-client";

export function WakeOnOpen({ wake = authClient.wake }: { wake?: AuthClient["wake"] }) {
  useEffect(() => {
    void wake();
  }, [wake]);
  return null;
}
