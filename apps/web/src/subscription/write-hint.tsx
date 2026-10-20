"use client";

// Why the subscription refuses a button (ADR 0021): the refusal's sentence under it, which the button names as its
// description (`aria-describedby={id}`). While the read-only banner says the same above every screen, the sentence is
// for screen readers only, so a page doesn't say it three times (the banner, the hint, the empty state). A screen whose
// button has nothing else beside it that says why asks for the sentence to be `visible`.
import { FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useSubscription } from "./use-subscription";

export function WriteHint({ id, hint, visible = false }: { id: string; hint: string | null; visible?: boolean }) {
  const { data } = useSubscription();
  if (hint === null) return null;
  return (
    <FieldDescription id={id} className={cn("max-w-[40ch]", data?.access === "read_only" && !visible && "sr-only")}>
      {hint}
    </FieldDescription>
  );
}
