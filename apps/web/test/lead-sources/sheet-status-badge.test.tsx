// A sheet's state as a badge: Running green, Paused neutral, Needs attention amber (a lost tab, columns or manager), Lost
// access red and Setting up neutral; always the word with its dot, never colour alone.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { SheetStatusBadge } from "@/lead-sources/sheet-status-badge";

const words = messages.sheets.statuses;

function badge(status: Parameters<typeof SheetStatusBadge>[0]["status"]) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SheetStatusBadge status={status} />
    </NextIntlClientProvider>,
  );
}

describe("SheetStatusBadge", () => {
  it.each([
    ["running", words.running, "good"],
    ["paused", words.paused, "neutral"],
    ["tab_missing", words.attention, "attention"],
    ["columns_missing", words.attention, "attention"],
    ["needs_manager", words.attention, "attention"],
    ["lost_access", words.lost_access, "bad"],
    ["connecting", words.connecting, "neutral"],
  ] as const)("shows %s as %s, in the %s tone, with a dot", (status, word, tone) => {
    badge(status);
    const shown = screen.getByText(word);
    expect(shown.className).toContain(`status-${tone}`);
    expect(shown.querySelector("span[aria-hidden='true']")?.className).toContain(`status-${tone}-dot`);
  });
});
