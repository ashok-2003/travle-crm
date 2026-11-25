// More: closed until opened, and its form sends the address, the quote's title, what travellers fill in and the GST switch.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { MoreSection } from "@/packages/section-more";
import { lastInputTo, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aPackage } from "./detail";

const words = messages.packages.form;

describe("More", () => {
  it("opens to a form and saves its fields alone", async () => {
    stubApi({ "packages.updatePart": { data: null } });
    const trip = aPackage({ kind: "group", slug: null, pricesIncludeGst: true });
    renderScreen(<MoreSection detail={trip} />, { width: "wide" });
    expect(screen.queryByLabelText(words.slug)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: messages.packages.sections.more.title }));
    // A trip with no address starts from one made of its name.
    expect(await screen.findByLabelText(words.slug)).toHaveValue("kedarnath-6-days");
    await userEvent.click(screen.getByRole("switch", { name: words.pricesIncludeGst }));
    await userEvent.click(screen.getByRole("button", { name: messages.packages.sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toBeDefined();
    });
    expect(lastInputTo("packages.updatePart")).toEqual({
      packageId: trip.id,
      kind: "group",
      slug: "kedarnath-6-days",
      title: trip.title,
      defaultTravellerLevel: null,
      pricesIncludeGst: false,
    });
  });

  it("turns a custom trip into a group trip", async () => {
    stubApi({ "packages.updatePart": { data: null } });
    const trip = aPackage({ kind: "custom", slug: "kedarnath" });
    renderScreen(<MoreSection detail={trip} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: messages.packages.sections.more.title }));
    expect(screen.queryByRole("switch", { name: words.pricesIncludeGst })).toBeNull();
    await userEvent.click(await screen.findByRole("radio", { name: words.kinds.group }));
    expect(screen.getByRole("switch", { name: words.pricesIncludeGst })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: messages.packages.sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toMatchObject({ kind: "group", pricesIncludeGst: true });
    });
  });

  it("is not offered for editing without quotes:edit", async () => {
    renderScreen(<MoreSection detail={aPackage()} />, { width: "wide", me: member({ permissions: ["quotes:view"] }) });
    await userEvent.click(screen.getByRole("button", { name: messages.packages.sections.more.title }));
    expect(screen.queryByRole("button", { name: messages.packages.sections.save })).toBeNull();
  });
});
