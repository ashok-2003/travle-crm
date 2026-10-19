// Matching a column's values (spec 3.2 step 2, B11): each value with how many rows hold it, in mono at the end, and its
// own Select of where it goes, the default first.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { ValueMatcher } from "@/imports/value-matcher";
import { renderAs, screenIs } from "../organization/render";

const words = messages.imports.values;
const asha = "0199e7a0-0000-7000-8000-00000000a5a1";
const ravi = "0199e7a0-0000-7000-8000-00000000a5a2";

beforeEach(() => {
  screenIs("wide");
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

describe("ValueMatcher", () => {
  it("lists a column's values with their counts in mono, each with its own Select", async () => {
    const onChoose = vi.fn<(value: string, target: string | null) => void>();
    renderAs(
      <ValueMatcher
        heading="Assigned To"
        values={[
          { value: "Asha", rows: 1512 },
          { value: "Vikas", rows: 85 },
        ]}
        targets={[
          { value: asha, label: "Asha Sharma" },
          { value: ravi, label: "Ravi Kumar" },
        ]}
        chosen={new Map([["Asha", asha]])}
        onChoose={onChoose}
        defaultLabel="Asha Sharma (Owner), the default"
      />,
    );
    expect(screen.getByRole("heading", { name: "Assigned To" })).toBeVisible();
    const count = screen.getByText("1,512");
    expect(count).toHaveClass("numbers");
    const vikas = screen.getByRole("combobox", { name: words.targetFor.replace("{value}", "Vikas") });
    expect(vikas).toHaveTextContent("Asha Sharma (Owner), the default");
    expect(screen.getByRole("combobox", { name: words.targetFor.replace("{value}", "Asha") })).toHaveTextContent(
      "Asha Sharma",
    );
    await userEvent.click(vikas);
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Asha Sharma (Owner), the default");
    await userEvent.click(within(document.body).getByRole("option", { name: "Ravi Kumar" }));
    expect(onChoose).toHaveBeenLastCalledWith("Vikas", ravi);
  });
});
