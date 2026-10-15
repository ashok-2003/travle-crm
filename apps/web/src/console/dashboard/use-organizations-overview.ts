"use client";

// The dashboard's organizations a page at a time (dashboard.organizations), oldest first: each page asks for those
// after the last organization of the page before.
import { useInfiniteQuery } from "@tanstack/react-query";
import { useConsoleTRPC, useConsoleTRPCClient } from "../data/console-trpc";

export const ORGANIZATIONS_PER_PAGE = 25;

export function useOrganizationsOverview() {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  const query = useInfiniteQuery({
    queryKey: [...trpc.dashboard.organizations.pathKey(), { limit: ORGANIZATIONS_PER_PAGE }],
    queryFn: ({ pageParam }) =>
      client.dashboard.organizations.query({
        limit: ORGANIZATIONS_PER_PAGE,
        ...(pageParam === null ? {} : { after: pageParam }),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  return { ...query, organizations: query.data?.pages.flatMap((page) => page.organizations) };
}
