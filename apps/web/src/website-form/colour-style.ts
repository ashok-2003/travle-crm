// The agency's colour as the registry's own variables on the form's wrapper (spec 8): null keeps the product's blue.
import type { PublicForm } from "@travel-crm/contracts/website-forms";
import type { CSSProperties } from "react";

export function colourStyle(colour: PublicForm["colour"]): CSSProperties | undefined {
  if (colour === null) return undefined;
  return { "--primary": colour.primary, "--primary-foreground": colour.ink, "--ring": colour.primary } as CSSProperties;
}
