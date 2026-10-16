// A document's share links (spec 9.3): each link's label, whether it works, how often it was opened and when last,
// and when it expires; a new link with a label and the default 30 days or never, its whole address shown once to copy;
// and turning one off after asking. A read-only organization makes no new links but may still turn one off.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { screenIs } from "../organization/render";
import { inputsSentTo } from "./sent";
import { document, forMeera, renderDialog, rowOf, token } from "./share-links";
import { subscriptionAnswer } from "./subscription";

const words = messages.documents.share;

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShareLinksDialog", () => {
  it("lists the links with whether each works, its opens, the last one and its expiry", async () => {
    renderDialog();
    expect(await screen.findByRole("dialog", { name: words.title.replace("{number}", document.number) })).toBeVisible();
    await screen.findByText("For Meera Iyer");
    const meera = rowOf("For Meera Iyer");
    expect(within(meera).getByText(words.status.active)).toBeVisible();
    expect(within(meera).getByText(/^Opened 2 times, last 16 Oct, 12:15\sam$/)).toBeVisible();
    expect(within(meera).getByText(words.neverExpires)).toBeVisible();
    expect(within(rowOf("Old link")).getByText(words.status.revoked)).toBeVisible();
    expect(within(rowOf("Last year's")).getByText(words.status.expired)).toBeVisible();
    expect(within(rowOf("Last year's")).getByText("Not opened yet")).toBeVisible();
    // Only a working link can be turned off.
    expect(within(rowOf("Old link")).queryByRole("button")).toBeNull();
    expect(within(rowOf("Last year's")).queryByRole("button")).toBeNull();
  });

  it("makes a link with a label and the default 30 days, and shows its whole address once, to copy", async () => {
    const user = userEvent.setup();
    const api = renderDialog({ "shareLinks.list": { data: [] } });
    expect(await screen.findByText(words.none)).toBeVisible();
    expect(screen.getByLabelText(words.label)).toHaveValue("Quotation SMPL-2026-0001");
    expect(screen.getByRole("radio", { name: words.expiryDefault })).toBeChecked();
    await user.click(screen.getByRole("button", { name: words.create }));

    const address = new URL(`/p/${token}`, window.location.origin).href;
    expect(await screen.findByLabelText(words.linkLabel)).toHaveValue(address);
    expect(screen.getByText(words.onlyOnce)).toBeVisible();
    expect(screen.getByRole("button", { name: words.copyLink })).toBeVisible();
    expect(inputsSentTo("shareLinks.create")).toEqual([
      { recordType: "issued_document", recordId: document.id, label: "Quotation SMPL-2026-0001" },
    ]);

    const listed = api.calls.filter((path) => path === "shareLinks.list").length;
    await user.click(screen.getByRole("button", { name: words.done }));
    expect(screen.queryByLabelText(words.linkLabel)).toBeNull();
    await waitFor(() => {
      expect(api.calls.filter((path) => path === "shareLinks.list").length).toBeGreaterThan(listed);
    });
  });

  it("makes a link that never expires", async () => {
    const user = userEvent.setup();
    renderDialog({ "shareLinks.list": { data: [] } });
    await screen.findByText(words.none);
    const label = screen.getByLabelText(words.label);
    await user.clear(label);
    await user.type(label, "For Meera Iyer");
    await user.click(screen.getByRole("radio", { name: words.expiryNever }));
    await user.click(screen.getByRole("button", { name: words.create }));
    await waitFor(() => {
      expect(inputsSentTo("shareLinks.create")).toEqual([
        { recordType: "issued_document", recordId: document.id, label: "For Meera Iyer", expiresAt: null },
      ]);
    });
  });

  it("asks for a label before sending anything", async () => {
    const user = userEvent.setup();
    const api = renderDialog({ "shareLinks.list": { data: [] } });
    await screen.findByText(words.none);
    await user.clear(screen.getByLabelText(words.label));
    await user.click(screen.getByRole("button", { name: words.create }));
    expect(await screen.findByText(words.labelInvalid)).toBeVisible();
    expect(api.calls).not.toContain("shareLinks.create");
  });

  it("shows a refusal as its sentence", async () => {
    const user = userEvent.setup();
    renderDialog({ "shareLinks.create": { status: 404, reason: "DOCUMENT_NOT_FOUND" } });
    await user.click(await screen.findByRole("button", { name: words.create }));
    expect(await screen.findByText(messages.errors.reasons.DOCUMENT_NOT_FOUND)).toBeVisible();
  });

  it("turns a link off after asking", async () => {
    const user = userEvent.setup();
    const api = renderDialog();
    await user.click(
      await screen.findByRole("button", { name: words.revokeNamed.replace("{label}", "For Meera Iyer") }),
    );
    expect(screen.getByText(words.revokeDescription)).toBeVisible();
    api.answer("shareLinks.list", { data: [{ ...forMeera, revokedAt: "2026-10-16T05:00:00.000Z" }] });
    await user.click(screen.getByRole("button", { name: words.revokeConfirm }));
    await waitFor(() => {
      expect(inputsSentTo("shareLinks.revoke")).toEqual([{ shareLinkId: forMeera.id }]);
    });
    await waitFor(() => {
      expect(within(rowOf("For Meera Iyer")).getByText(words.status.revoked)).toBeVisible();
    });
  });

  it("makes no new link in a read-only organization, saying why, but still turns one off", async () => {
    renderDialog({ "subscription.get": subscriptionAnswer("read_only") });
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(screen.getByRole("button", { name: words.create })).toBeDisabled();
    expect(screen.getByRole("button", { name: words.revokeNamed.replace("{label}", "For Meera Iyer") })).toBeEnabled();
  });
});
