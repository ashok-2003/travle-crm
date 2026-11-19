"use client";

// The agency's own mark at the top of the app's frame: its logo when it has uploaded one (organization.logo.forShell),
// its name otherwise, and while the logo loads or can't. The logo's link lives five minutes, so it is asked again
// before then; it is never kept on the device. OrgAvatar is the same mark for the sidebar's rail: the logo small and
// round, or the name's first letter on the brand's green while there is no logo.
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTRPC } from "@/data/trpc";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";

const LINK_REFRESH = 4 * 60 * 1000;

function useOrgLogo() {
  const trpc = useTRPC();
  return useQuery(
    trpc.organization.logo.forShell.queryOptions(undefined, {
      staleTime: LINK_REFRESH,
      refetchInterval: LINK_REFRESH,
      meta: { persist: false },
    }),
  );
}

export function OrgMark({ className }: { className?: string }) {
  const me = useMe();
  const logo = useOrgLogo();
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

/** The brand's green is the agency's mark's alone in the sidebar (web revamp part 5). */
export function OrgAvatar({ className }: { className?: string }) {
  const { name } = useMe().organization;
  const logo = useOrgLogo();
  return (
    <Avatar role="img" aria-label={name} className={className}>
      {logo.data && <AvatarImage src={logo.data.url} alt="" className="object-contain" />}
      <AvatarFallback aria-hidden="true" className="bg-sidebar-fill font-semibold text-sidebar-ink">
        {Array.from(name.trim())[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
