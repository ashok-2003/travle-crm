"use client";

// The messages for the people a staff member ticked, written one AI call each, three at a time so the screen fills as they
// arrive. Nothing runs twice (a re-render, strict mode): each person is started once, and "Write again" starts one more.
import { OFFER_MESSAGES_MAX } from "@travel-crm/contracts/ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWriteSeatMessage } from "./use-ai-departures";

const AT_A_TIME = 3;

export type SeatMessageState =
  | { status: "writing" }
  | { status: "ready"; fillId: string; text: string; removedAmounts: boolean }
  | { status: "failed"; error: unknown };

export function useSeatMessages(departureId: string, leadIds: readonly string[]) {
  const write = useWriteSeatMessage();
  const [messages, setMessages] = useState<Readonly<Record<string, SeatMessageState>>>({});
  const queued = useRef(new Set<string>());
  const waiting = useRef<string[]>([]);
  const active = useRef(0);

  const run = useCallback(
    async (leadId: string) => {
      try {
        const written = await write.mutateAsync({ departureId, leadId });
        setMessages((before) => ({
          ...before,
          [leadId]: {
            status: "ready",
            fillId: written.fillId,
            text: written.text,
            removedAmounts: written.removedAmounts,
          },
        }));
      } catch (error) {
        setMessages((before) => ({ ...before, [leadId]: { status: "failed", error } }));
      }
    },
    [write, departureId],
  );

  const pump = useCallback(() => {
    while (active.current < AT_A_TIME) {
      const next = waiting.current.shift();
      if (next === undefined) return;
      active.current += 1;
      void run(next).finally(() => {
        active.current -= 1;
        pump();
      });
    }
  }, [run]);

  const start = useCallback(
    (leadId: string) => {
      setMessages((before) => ({ ...before, [leadId]: { status: "writing" } }));
      waiting.current.push(leadId);
      pump();
    },
    [pump],
  );

  useEffect(() => {
    for (const leadId of leadIds.slice(0, OFFER_MESSAGES_MAX)) {
      if (queued.current.has(leadId)) continue;
      queued.current.add(leadId);
      start(leadId);
    }
  }, [leadIds, start]);

  return {
    messages,
    /** Writes this person's message again (a new AI call). */
    again: start,
    /** Staff edited the words. */
    edit: (leadId: string, text: string) => {
      setMessages((before) => {
        const one = before[leadId];
        return one?.status === "ready" ? { ...before, [leadId]: { ...one, text } } : before;
      });
    },
  };
}
