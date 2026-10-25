"use client";

// A chat's round picture (sales inbox spec, section 3): the person's initials on the People tint (DESIGN.md: the inbox is
// violet information), a person icon for a number nobody has named. One size for the list, a larger one for the
// contact panel.
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

export function ChatAvatar({ name, size = "default" }: { name: string | null; size?: "default" | "large" }) {
  return (
    <Avatar className={cn(size === "large" ? "size-20" : "size-11")}>
      <AvatarFallback
        className={cn("bg-people-tint font-semibold text-people-tint-ink", size === "large" && "text-section")}
      >
        {name === null ? (
          <UserRoundIcon aria-hidden="true" className={size === "large" ? "size-9" : "size-5"} />
        ) : (
          initialsOf(name)
        )}
      </AvatarFallback>
    </Avatar>
  );
}
