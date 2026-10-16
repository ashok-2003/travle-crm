"use client";

// The dashboard's organizations a page at a time (dashboard.organizations, data/use-cursor-pages.ts), oldest first:
// each page asks for those after the last organization of the page before.
import { useCursorPages } from "@/data/use-cursor-pages";
import { useConsoleTRPC, useConsoleTRPCClient } from "../data/console-trpc";

export const ORGANIZATIONS_PER_PAGE = 25;

export function useOrganizationsOverview() {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.dashboard.organizations.pathKey(), { limit: ORGANIZATIONS_PER_PAGE }],
    page: (cursor) =>
      client.dashboard.organizations.query({
        limit: ORGANIZATIONS_PER_PAGE,
        ...(cursor === null ? {} : { after: cursor }),
      }),
    items: (page) => page.organizations,
  });
}
