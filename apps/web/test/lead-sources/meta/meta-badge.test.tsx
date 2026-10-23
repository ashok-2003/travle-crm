// A Page's badge (spec 3.1): the word with its dot, in the tone of its meaning; a running Page of a read-only agency saves
// nothing, so it says Paused.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { MetaBadge } from "@/lead-sources/meta/meta-badge";
import { renderAs } from "../../organization/render";

describe("MetaBadge", () => {
  it.each([
    ["running", messages.metaLeads.badges.running, "text-status-good-ink"],
    ["paused", messages.metaLeads.badges.paused, "text-status-neutral-ink"],
    ["needs_attention", messages.metaLeads.badges.needs_attention, "text-status-attention-ink"],
    ["needs_reconnect", messages.metaLeads.badges.needs_reconnect, "text-status-bad-ink"],
  ] as const)("says %s in its tone", (badge, word, tone) => {
    renderAs(<MetaBadge badge={badge} />);
    expect(screen.getByText(word)).toHaveClass(tone);
  });

  it("says Paused for a running Page of a read-only agency", () => {
    renderAs(<MetaBadge badge="running" readOnly />);
    expect(screen.getByText(messages.metaLeads.badges.paused)).toBeVisible();
    expect(screen.queryByText(messages.metaLeads.badges.running)).toBeNull();
  });
});
