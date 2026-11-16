"use client";

// The console's push api on its tRPC client, for the pop-up, the Platform updates page and signing out.
import { useMemo } from "react";
import type { PushApi } from "@/notifications/push/push-api";
import { useConsoleTRPCClient } from "../data/console-trpc";
import { consolePushApi } from "./console-push-api";

export function useConsolePushApi(): PushApi {
  const client = useConsoleTRPCClient();
  return useMemo(() => consolePushApi(client), [client]);
}
