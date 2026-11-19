// The pipeline's columns as the cache holds them, and a move made there before the api answers (use-move-lead.tsx):
// the lead leaves every page of every column it shows on (a list that shifted between pages can show it twice), lands
// at a place in its new column (the top, or where it was for a move put back), and the open stages' counts follow.
import {
  isOpenStage,
  openLeadStages,
  type LeadCounts,
  type LeadListItem,
  type LeadListPage,
  type LeadStage,
  type PeopleNames,
} from "@travel-crm/contracts/crm";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { useTRPC } from "@/data/trpc";
import { leadsKey } from "../list/use-leads";

/** The board's columns: the open stages and Won. */
export const boardStages = [...openLeadStages, "won"] as const;
export type BoardStage = (typeof boardStages)[number];

export type BoardView = "mine" | "everyone";

/** A column's leads.list input: its view and stage, 20 leads a page. */
export const columnInput = (view: BoardView, stage: LeadStage) => ({ view, stage, limit: 20 });

/** A column's pages, as useLeads keeps them. */
export type Column = InfiniteData<LeadListPage, string | null>;

/** Where a card is on the board: its column's stage, its place there, the card and its owner's name. */
export interface Found {
  from: LeadStage;
  place: number;
  card: LeadListItem;
  people: PeopleNames;
}

/** One view's board in the cache: where a card is, and a card put in another column. */
export function boardCache(queryClient: QueryClient, trpc: ReturnType<typeof useTRPC>, view: BoardView) {
  const columnKey = (stage: LeadStage) => leadsKey(trpc, columnInput(view, stage));
  return {
    find(leadId: string): Found | null {
      for (const from of boardStages) {
        const column = queryClient.getQueryData<Column>(columnKey(from));
        const cards = column?.pages.flatMap((page) => page.items) ?? [];
        const place = cards.findIndex((item) => item.id === leadId);
        const card = cards[place];
        if (column && card) {
          const people = Object.assign({}, ...column.pages.map((page) => page.people)) as PeopleNames;
          return { from, place, card, people };
        }
      }
      return null;
    },
    /** The card at `place` in `to`'s column and in no other, as the api will list it; the counts move with it. */
    put({ card, people }: Found, from: LeadStage, to: LeadStage, place: number) {
      // A lead waits for its first reply only while New.
      const next = { ...card.next, awaitingReplySince: to === "new" ? card.createdAt : null };
      const moved = { ...card, stage: to, next };
      for (const stage of boardStages) {
        queryClient.setQueryData<Column>(
          columnKey(stage),
          (column) => column && (stage === to ? withLead(column, moved, place, people) : withoutLead(column, card.id)),
        );
      }
      queryClient.setQueryData(
        trpc.leads.counts.queryKey({ view }),
        (counts) => counts && countsAfterMove(counts, from, to),
      );
    },
  };
}

/** The column without the lead, on every page. */
export function withoutLead(column: Column, leadId: string): Column {
  return {
    ...column,
    pages: column.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== leadId) })),
  };
}

/** The column with the lead once, at `place` across its pages (past the end: last), and its owner's name with it. */
export function withLead(column: Column, lead: LeadListItem, place: number, people: PeopleNames): Column {
  let before = place;
  let placed = false;
  const pages = withoutLead(column, lead.id).pages.map((page, index, all) => {
    if (placed || (before > page.items.length && index < all.length - 1)) {
      before -= page.items.length;
      return page;
    }
    placed = true;
    const items = [...page.items];
    items.splice(Math.min(before, items.length), 0, lead);
    return { ...page, items, people: { ...page.people, ...people } };
  });
  return { ...column, pages };
}

/** The open leads by stage once a lead has moved from one stage to another. */
export function countsAfterMove(counts: LeadCounts, from: LeadStage, to: LeadStage): LeadCounts {
  const next = { ...counts };
  if (isOpenStage(from)) {
    next[from] -= 1;
    next.open -= 1;
  }
  if (isOpenStage(to)) {
    next[to] += 1;
    next.open += 1;
  }
  return next;
}
