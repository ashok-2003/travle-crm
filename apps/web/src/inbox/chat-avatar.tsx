"use client";

// A chat's round picture (sales inbox spec, section 3 and design v2): the person's initials on a soft tint of their own,
// picked by a hash of the chat, so the same customer always wears the same colour and a long list is easy to scan; a
// person icon for a number nobody has named. One size for the list and the chat's bar, a larger one for the contact panel.
import { UserRoundIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Up to two initials of a name. */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();

/** The tints, written out in full so Tailwind finds every class (the brand's avatar colours). */
const tints = [
  "bg-avatar-sky-fill text-avatar-sky-ink",
  "bg-avatar-rose-fill text-avatar-rose-ink",
  "bg-avatar-amber-fill text-avatar-amber-ink",
  "bg-avatar-sage-fill text-avatar-sage-ink",
  "bg-avatar-violet-fill text-avatar-violet-ink",
  "bg-avatar-sand-fill text-avatar-sand-ink",
] as const;

/** The same tint for the same seed, every time. */
export function tintOf(seed: string): string {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return tints[hash % tints.length] ?? tints[0];
}

export function ChatAvatar({
  name,
  seed,
  size = "default",
}: {
  name: string | null;
  /** What picks the tint: the chat's id, so a renamed person keeps their colour. */
  seed: string;
  size?: "default" | "large";
}) {
  return (
    <Avatar className={cn(size === "large" ? "size-20" : "size-11")}>
      <AvatarFallback className={cn("font-semibold", tintOf(seed), size === "large" && "text-section")}>
        {name === null ? (
          <UserRoundIcon aria-hidden="true" className={size === "large" ? "size-9" : "size-5"} />
        ) : (
          initialsOf(name)
        )}
      </AvatarFallback>
    </Avatar>
  );
}
