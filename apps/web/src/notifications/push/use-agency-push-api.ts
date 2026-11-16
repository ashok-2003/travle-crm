"use client";

// The agency app's push api on its tRPC client, for the notification choices' card and the pop-up.
import { useMemo } from "react";
import { useTRPCClient } from "@/data/trpc";
import { pushApi, type PushApi } from "./push-api";

export function useAgencyPushApi(): PushApi {
  const client = useTRPCClient();
  return useMemo(() => pushApi(client), [client]);
}
