"use client";

// A pipeline move made at once (web revamp part 4, owner 2026-11-20): the card leaves its column and lands at the top
// of its new one, and the counts follow, before leads.moveStage answers; a toast says so, with Undo, which moves it back
// the same way, to the place it had. A refusal puts the card back where it was and says why in that toast. The columns
// refresh quietly once the last move is answered, keeping what is shown while they load. Moves reach the api one at a
// time, in the order they were made (one mutation scope), so two quick moves of a card land as made, and a refusal puts
// a card back only when no later move has taken it on since (that move's own answer decides).
import type { LeadStage } from "@travel-crm/contracts/crm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useErrorMessage } from "@/lib/error-message";
import { boardCache, type BoardView } from "./board-cache";
import type { DraggedLead } from "./dragged-lead";

/** A move: the lead, the stage it goes to, and for an Undo, the place it had there. */
interface Move {
  lead: DraggedLead;
  to: LeadStage;
  place?: number;
}

const toastId = (leadId: string) => `pipeline-move-${leadId}`;

/** Moves a lead at once; the same function on every render of a view, so the board's cards needn't draw again. */
export function useMoveLead(view: BoardView): (lead: DraggedLead, to: LeadStage) => void {
  const t = useTranslations("leads");
  const { apiError } = useErrorMessage();
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const refresh = useRefreshWork();
  const latest = useRef(new Map<string, Move>());
  const board = boardCache(queryClient, trpc, view);
  const moveKey = trpc.leads.moveStage.mutationKey();

  const { mutate } = useMutation({
    mutationKey: moveKey,
    mutationFn: ({ lead, to }: Move) => client.leads.moveStage.mutate({ leadId: lead.id, stage: to }),
    scope: { id: "pipeline-moves" },
    onMutate: async (move) => {
      latest.current.set(move.lead.id, move);
      // A load on its way would bring back what the api had before the move.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: trpc.leads.list.pathKey() }),
        queryClient.cancelQueries({ queryKey: trpc.leads.counts.pathKey() }),
      ]);
      const found = board.find(move.lead.id);
      if (found) board.put(found, found.from, move.to, move.place ?? 0);
      const undo = found && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            mutate({ lead: move.lead, to: found.from, place: found.place });
          }}
        >
          {t("pipeline.undo")}
        </Button>
      );
      toast.success(t("pipeline.moved", { name: move.lead.name, stage: t(`stages.${move.to}`) }), {
        id: toastId(move.lead.id),
        action: undo,
      });
      return found;
    },
    onError: (error, move, found) => {
      if (found && latest.current.get(move.lead.id) === move) board.put(found, move.to, found.from, found.place);
      toast.error(apiError(error), { id: toastId(move.lead.id), action: null, duration: Infinity });
    },
    onSettled: () => {
      // Only once no other move waits: a load between two moves would show the card where the first one put it.
      if (queryClient.isMutating({ mutationKey: moveKey }) === 1) void refresh();
    },
  });

  return useCallback(
    (lead: DraggedLead, to: LeadStage) => {
      if (boardCache(queryClient, trpc, view).find(lead.id)?.from !== to) mutate({ lead, to });
    },
    [queryClient, trpc, view, mutate],
  );
}
