"use client";

// The leads chosen on the list for a bulk change (release C): kept by id while the person scrolls and shows more, and
// cleared when the list itself changes (another filter, tab or search), so a change never reaches a lead out of view.
import { useCallback, useState } from "react";

export interface LeadSelection {
  chosen: ReadonlySet<string>;
  toggle: (leadId: string) => void;
  /** Chooses every one of these, or, when all are chosen already, none of them. */
  toggleAll: (leadIds: readonly string[]) => void;
  clear: () => void;
}

export function useLeadSelection(listKey: string): LeadSelection {
  const [state, setState] = useState<{ listKey: string; chosen: ReadonlySet<string> }>({ listKey, chosen: new Set() });
  // A different list starts with nothing chosen.
  const chosen = state.listKey === listKey ? state.chosen : new Set<string>();
  const set = useCallback(
    (next: (current: ReadonlySet<string>) => ReadonlySet<string>) => {
      setState((current) => ({ listKey, chosen: next(current.listKey === listKey ? current.chosen : new Set()) }));
    },
    [listKey],
  );
  return {
    chosen,
    toggle: (leadId) => {
      set((current) => {
        const next = new Set(current);
        if (!next.delete(leadId)) next.add(leadId);
        return next;
      });
    },
    toggleAll: (leadIds) => {
      set((current) => {
        const allChosen = leadIds.every((leadId) => current.has(leadId));
        const next = new Set(current);
        for (const leadId of leadIds) {
          if (allChosen) next.delete(leadId);
          else next.add(leadId);
        }
        return next;
      });
    },
    clear: () => {
      set(() => new Set());
    },
  };
}
