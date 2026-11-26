// The shared plan parts: the days as boxes with an arrow between them, and the points of a list, one a line.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { cardTints } from "@/components/card-tints";
import { DayBoxes } from "@/components/trip-plan/day-boxes";
import { PointList } from "@/components/trip-plan/point-list";
import { locale, messages } from "@/i18n/messages";

const inIntl = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("day boxes", () => {
  it("makes each day a box named Day n · title, with its words, and a hidden arrow between days", () => {
    inIntl(
      <DayBoxes
        days={[
          { title: "Delhi to Manali", description: "Overnight Volvo." },
          { title: "Manali", description: "" },
        ]}
      />,
    );
    const boxes = screen.getAllByRole("listitem");
    expect(boxes).toHaveLength(2);
    const first = boxes.at(0);
    expect(first && within(first).getByText("Day 1 · Delhi to Manali")).toBeTruthy();
    expect(first && within(first).getByText("Overnight Volvo.")).toBeTruthy();
    expect(screen.getByText("Day 2 · Manali")).toBeTruthy();
    const arrows = document.querySelectorAll("[data-slot=day-arrow]");
    expect(arrows).toHaveLength(1);
    expect(arrows[0]?.closest("[aria-hidden=true]")).not.toBeNull();
  });

  it("tints every box in the plan's sky, as the customer's page and the PDF do", () => {
    inIntl(<DayBoxes days={[{ title: "Manali", description: "" }]} />);
    expect(screen.getByRole("listitem").className).toContain(cardTints.sky);
  });

  it("draws nothing for no days", () => {
    const { container } = inIntl(<DayBoxes days={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("point lists", () => {
  it("splits stored text on its lines, one point each, dropping blanks and bullet marks", () => {
    inIntl(<PointList tone="plain" text={"Flights\n\n- Visa fees\r\n• Tips, lunch and dinner"} />);
    const points = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(points.map((point) => point.textContent)).toEqual(["Flights", "Visa fees", "Tips, lunch and dinner"]);
  });

  it("ticks included points and crosses excluded ones, decoratively", () => {
    inIntl(
      <>
        <PointList tone="included" text={"Breakfast\nCab"} />
        <PointList tone="excluded" text={"Flights"} />
      </>,
    );
    expect(document.querySelectorAll("[data-mark=tick]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-mark=cross]")).toHaveLength(1);
    for (const mark of document.querySelectorAll("[data-mark]")) expect(mark.getAttribute("aria-hidden")).toBe("true");
    // An exclusion is plain: its cross in muted ink, never a status colour.
    expect(document.querySelector("[data-mark=cross]")?.getAttribute("class")).toContain("text-muted-foreground");
  });

  it("keeps a minus that starts a point, taking off only a bullet a space follows", () => {
    inIntl(<PointList tone="plain" text={"-5% early bird\n- Stay"} />);
    const points = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(points.map((point) => point.textContent)).toEqual(["-5% early bird", "Stay"]);
  });

  it("draws nothing for empty text", () => {
    const { container } = inIntl(<PointList tone="plain" text={"  \n "} />);
    expect(container.firstChild).toBeNull();
  });
});
