// A query cache that already knows which agent Try it runs, so a test's first send goes straight to that agent.
import type { AppRouter } from "@travel-crm/api";
import type { AgentKind } from "@travel-crm/contracts/ai";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { createApiClient } from "@/data/trpc";
import { newQueryClient, paidSubscription } from "../organization/api";

export function clientRunning(agent: AgentKind) {
  const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
  queryClient.setQueryDefaults(trpc.ai.testAgent.queryKey(), { staleTime: Infinity });
  queryClient.setQueryData(trpc.ai.testAgent.queryKey(), { agent });
  return queryClient;
}
