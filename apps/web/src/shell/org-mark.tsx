"use client";

// The agency's own mark at the top of the app's frame: its logo when it has uploaded one (organization.logo.forShell),
// its name otherwise, and while the logo loads or can't. The logo's link lives five minutes, so it is asked again
// before then; it is never kept on the device.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";

const LINK_REFRESH = 4 * 60 * 1000;

export function OrgMark({ className }: { className?: string }) {
  const me = useMe();
  const trpc = useTRPC();
  const logo = useQuery(
    trpc.organization.logo.forShell.queryOptions(undefined, {
      staleTime: LINK_REFRESH,
      refetchInterval: LINK_REFRESH,
      meta: { persist: false },
    }),
  );
  if (logo.data) {
    return (
      // A presigned link to storage, which Next's image optimiser can't fetch.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo.data.url}
        alt={me.organization.name}
        className={cn("h-10 w-auto max-w-full object-contain object-left", className)}
      />
    );
  }
  return (
    <p className={cn("script-leading text-section font-semibold break-words", className)}>{me.organization.name}</p>
  );
}
