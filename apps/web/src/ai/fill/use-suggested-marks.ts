"use client";

// What the AI filled into a lead from the customer's first messages, as marks by path (the same marks a fill leaves in a form),
// so the edit form shows those fields in violet too, until the person changes one.
import type { AiFillField, FillPath } from "@travel-crm/contracts/ai";
import { useLeadAiFields } from "../use-ai";

export function useSuggestedMarks(leadId: string): Partial<Record<FillPath, AiFillField>> {
  const { data } = useLeadAiFields(leadId);
  return Object.fromEntries(
    (data?.fields ?? []).map((one) => [
      one.path,
      { path: one.path, value: one.value, from: "chat", excerpt: one.excerpt },
    ]),
  );
}
