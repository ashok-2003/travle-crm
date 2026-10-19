// The matchers' one Select (W4): its "nothing" choice can't be mistaken for a target of the same name, so a role whose
// key is "none" is picked as that role, and Don't import as nothing.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchSelect } from "@/imports/match-select";
import { renderAs, screenIs } from "../organization/render";

beforeEach(() => {
  screenIs("wide");
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

describe("MatchSelect", () => {
  it("tells a target named none from nothing chosen", async () => {
    const onChange = vi.fn<(value: string | null) => void>();
    const { rerender } = renderAs(
      <MatchSelect
        label="Role for Sales"
        value={null}
        noneLabel="Don't import"
        options={[{ value: "none", label: "None (a role)" }]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Role for Sales" })).toHaveTextContent("Don't import");
    await userEvent.click(screen.getByRole("combobox", { name: "Role for Sales" }));
    await userEvent.click(screen.getByRole("option", { name: "None (a role)" }));
    expect(onChange).toHaveBeenLastCalledWith("none");
    rerender(
      <MatchSelect
        label="Role for Sales"
        value="none"
        noneLabel="Don't import"
        options={[{ value: "none", label: "None (a role)" }]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Role for Sales" })).toHaveTextContent("None (a role)");
    await userEvent.click(screen.getByRole("combobox", { name: "Role for Sales" }));
    await userEvent.click(screen.getByRole("option", { name: "Don't import" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
