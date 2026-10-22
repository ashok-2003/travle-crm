// The agency on the visitor's page: its logo (height 40) and name, or the name alone (spec 3.5, 3.8).
import { cn } from "@/lib/utils";

export function AgencyMark({ name, logoUrl, className }: { name: string; logoUrl: string | null; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {logoUrl !== null && (
        // A presigned link to storage, which Next's image optimiser can't fetch.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-10 w-auto max-w-full object-contain object-left" />
      )}
      <p className="script-leading text-section font-semibold break-words">{name}</p>
    </div>
  );
}
