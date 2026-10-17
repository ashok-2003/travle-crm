"use client";

// Who a typed contact belongs to (spec 3.2, R19, R33), asked once typing pauses: leads.knownContact names the person
// a phone, email or Instagram handle belongs to, their newest open lead (its destination and owner; its id only when
// the asker can see it) and whether a contact is on the blocked list. Only contacts the api would take are asked about.
import { emailAddress, instagramHandle, knownContactInput, type KnownContactInput } from "@travel-crm/contracts/crm";
import { phoneNumber } from "@travel-crm/contracts/kernel";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { useTRPC } from "@/data/trpc";
import type { PersonValues } from "./lead-form-values";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/** A contact as the api keeps it (E.164, lower case), or nothing when blank or not a contact at all. */
function contactOf<Output>(schema: z.ZodType<Output>, text: string): Output | undefined {
  if (text.trim() === "") return undefined;
  const parsed = schema.safeParse(text.trim());
  return parsed.success ? parsed.data : undefined;
}

/** The valid contacts among those typed, or null for none. */
export function knownContactsOf(values: Partial<Pick<PersonValues, "phone" | "email" | "instagramHandle">>) {
  const phone = contactOf(phoneNumber, values.phone ?? "");
  const email = contactOf(emailAddress, values.email ?? "");
  const handle = contactOf(instagramHandle, values.instagramHandle ?? "");
  const contacts: KnownContactInput = {
    ...(phone !== undefined && { phone }),
    ...(email !== undefined && { email }),
    ...(handle !== undefined && { instagramHandle: handle }),
  };
  return Object.keys(contacts).length > 0 ? contacts : null;
}

export function useKnownContact(contacts: KnownContactInput | null) {
  const trpc = useTRPC();
  // Compared as text, so contacts built afresh on each render don't restart the pause.
  const settled = useDebouncedValue(contacts === null ? "" : JSON.stringify(contacts));
  const input = settled === "" ? null : knownContactInput.safeParse(JSON.parse(settled));
  return useQuery(trpc.leads.knownContact.queryOptions(input?.success ? input.data : skipToken));
}
