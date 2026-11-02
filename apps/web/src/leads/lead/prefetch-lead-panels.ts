// Asks for what a lead's page cards need in the same batch as the lead itself (leads.get), so the page does not wait for
// the lead before it asks for the quotes, chat, timeline and the rest: each card keeps its own query and reads it from
// the cache. A card the role or the plan doesn't have is not asked for, by the same rules the card applies.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { holds, useMe } from "@/session/me-context";
import { isOnPlan } from "@/shell/navigation";
import { useSubscription } from "@/subscription/use-subscription";

export function usePrefetchLeadPanels(leadId: string, valid: boolean): void {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const me = useMe();
  const modules = useSubscription().data?.modules;
  // Only these answers matter to the effect, so a new `me` object with the same grants does not ask again.
  const mayInsight = holds(me, "ai:suggest") && (modules?.includes("ai") ?? false);
  const mayQuotes = holds(me, "quotes:view") && isOnPlan({ module: "quotes" }, modules);
  const mayBookings = holds(me, "bookings:view") && isOnPlan({ module: "bookings" }, modules);
  const mayDepartures = holds(me, "departures:view") && isOnPlan({ module: "departures" }, modules);
  const mayChat = holds(me, "inbox:view") && (modules === undefined || modules.includes("inbox"));

  useEffect(() => {
    if (!valid) return;
    // Errors are swallowed: a card that needs its data asks again on its own.
    const ask = (query: Promise<unknown>) => void query.catch(() => undefined);
    ask(queryClient.query(trpc.sales.forLead.queryOptions({ leadId })));
    ask(queryClient.query(trpc.ai.bookingsForLead.queryOptions({ leadId })));
    queryClient
      .infiniteQuery({
        queryKey: [...trpc.leads.timeline.pathKey(), { leadId }],
        queryFn: () => client.leads.timeline.query({ leadId }),
        initialPageParam: null as string | null,
      })
      .catch(() => undefined);
    if (mayInsight) {
      ask(queryClient.query(trpc.ai.leadInsight.queryOptions({ leadId })));
      ask(queryClient.query(trpc.ai.leadFields.queryOptions({ leadId })));
    }
    if (mayQuotes) {
      ask(queryClient.query(trpc.quotes.forLead.queryOptions({ leadId })));
      ask(queryClient.query(trpc.quotes.settings.queryOptions()));
      ask(queryClient.query(trpc.quotes.packages.queryOptions()));
    }
    if (mayBookings) {
      ask(queryClient.query(trpc.bookings.forLead.queryOptions({ leadId })));
    }
    if (mayDepartures) {
      ask(queryClient.query(trpc.departures.forLead.queryOptions({ leadId })));
    }
    if (mayChat) {
      ask(queryClient.query(trpc.inbox.leadChat.queryOptions({ leadId })));
    }
  }, [leadId, valid, mayInsight, mayQuotes, mayBookings, mayDepartures, mayChat, trpc, client, queryClient]);
}
