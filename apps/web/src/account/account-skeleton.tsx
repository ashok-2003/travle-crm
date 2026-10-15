// What an account screen shows before it can show itself: in the prerendered page until the JavaScript has read the
// address, and while a step screen waits for me.get. Screen readers hear that it is loading.
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

export function AccountSkeleton() {
  const t = useTranslations("common");
  return (
    // DESIGN.md: skeletons only after 200ms. A CSS delay, because the prerendered copy is shown before any script runs.
    <div
      role="status"
      aria-busy="true"
      aria-label={t("loading")}
      className="flex flex-col gap-6 transition-opacity delay-200 starting:opacity-0"
    >
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
