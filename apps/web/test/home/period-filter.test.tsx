// Home's period filter: four chips from tablets up, and on a phone, where the chips took two rows, one dropdown
// (owner, 2026-11-19). Either way it is named Period, shows the chosen period and hands the new one over.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeriodFilter } from "@/home/period-filter";
import { locale, messages } from "@/i18n/messages";
import { screenIs } from "../organization/render";

function renderFilter() {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PeriodFilter value="month" onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

beforeEach(() => {
  // Radix's Select reaches for pointer capture and scrolling, which jsdom lacks.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PeriodFilter", () => {
  it("is four chips on a wide screen, the chosen one checked", async () => {
    screenIs("wide");
    const onChange = renderFilter();
    const group = screen.getByRole("radiogroup", { name: "Period" });
    expect(screen.getByRole("radio", { name: "This month" })).toBeChecked();
    expect(group.querySelectorAll("[role=radio]")).toHaveLength(4);
    await userEvent.click(screen.getByRole("radio", { name: "This week" }));
    expect(onChange).toHaveBeenCalledWith("week");
  });

  it("is one dropdown on a phone", async () => {
    screenIs("phone");
    const onChange = renderFilter();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    const period = screen.getByRole("combobox", { name: "Period" });
    expect(period).toHaveTextContent("This month");
    await userEvent.click(period);
    await userEvent.click(await screen.findByRole("option", { name: "This week" }));
    expect(onChange).toHaveBeenCalledWith("week");
  });
});
