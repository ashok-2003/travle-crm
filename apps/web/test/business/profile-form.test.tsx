// The business profile's careful parts (Ruling B): a saved bank account number shows only by its last four digits and
// goes back to the api unchanged, Change gives an empty box and Keep the saved number again; the profile, bank details
// and all, never goes into the device's saved copy; a newer profile from elsewhere doesn't wipe what is being typed; and
// +91 shows only before a number without its own country code.
import { dehydrate, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileScreen } from "@/business/profile/profile-screen";
import { dehydrateOptions } from "@/data/persistence";
import { messages } from "@/i18n/messages";
import { stubApi } from "../support/api-stub";
import { newQueryClient, renderWithApi } from "../organization/api";
import { owner, saved, subscription } from "./profile";
import { inputsSentTo } from "./sent";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const words = messages.business.profile;

const banked = {
  ...saved,
  bankAccountName: "Konkan Trails LLP",
  bankAccountNumber: "001234567890",
  bankIfsc: "HDFC0001234",
  bankName: "HDFC Bank",
};

function renderScreen(profile: typeof saved) {
  const api = stubApi({ "organization.profile.get": { data: profile }, "subscription.get": subscription("full") });
  const queryClient = newQueryClient(null);
  renderWithApi(<ProfileScreen />, queryClient, owner);
  return { api, queryClient };
}

/** The query keys the device's saved copy (IndexedDB) would hold now. */
const savedCopyOf = (queryClient: QueryClient) =>
  dehydrate(queryClient, dehydrateOptions).queries.map((query) => JSON.stringify(query.queryKey));

const profileQueryOf = (queryClient: QueryClient) => {
  const query = queryClient
    .getQueryCache()
    .findAll({ predicate: (each) => JSON.stringify(each.queryKey).includes("profile") })[0];
  if (!query) throw new Error("the profile was never asked for");
  return query.queryKey;
};

describe("the business profile form", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a saved account number only by its last four digits, and sends it back unchanged", async () => {
    const { api } = renderScreen(banked);
    const number = await screen.findByLabelText(words.bankAccountNumber);
    expect(number).toHaveValue("XXXX7890");
    expect(number).toHaveAttribute("readonly");
    expect(screen.queryByDisplayValue("001234567890")).toBeNull();
    api.answer("organization.profile.update", { data: banked });
    await userEvent.click(screen.getByRole("button", { name: messages.common.save }));
    await waitFor(() => {
      expect(inputsSentTo("organization.profile.update")).toEqual([
        expect.objectContaining({ bankAccountNumber: "001234567890" }),
      ]);
    });
  });

  it("gives an empty box to change the account number, and Keep goes back to the saved one", async () => {
    const { api } = renderScreen(banked);
    await userEvent.click(await screen.findByRole("button", { name: words.changeAccountNumber }));
    const box = screen.getByLabelText(words.bankAccountNumber);
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
    await userEvent.type(box, "1111 2222");
    await userEvent.click(screen.getByRole("button", { name: words.keepAccountNumber }));
    expect(screen.getByLabelText(words.bankAccountNumber)).toHaveValue("XXXX7890");

    await userEvent.click(screen.getByRole("button", { name: words.changeAccountNumber }));
    await userEvent.type(screen.getByLabelText(words.bankAccountNumber), "1111 2222 3333");
    api.answer("organization.profile.update", { data: { ...banked, bankAccountNumber: "111122223333" } });
    await userEvent.click(screen.getByRole("button", { name: messages.common.save }));
    await waitFor(() => {
      expect(screen.getByLabelText(words.bankAccountNumber)).toHaveValue("XXXX3333");
    });
    expect(inputsSentTo("organization.profile.update")).toEqual([
      expect.objectContaining({ bankAccountNumber: "111122223333" }),
    ]);
  });

  it("never puts the profile, bank details and all, in the device's saved copy", async () => {
    const { api, queryClient } = renderScreen(banked);
    await screen.findByLabelText(words.bankAccountNumber);
    expect(savedCopyOf(queryClient).some((key) => key.includes("subscription"))).toBe(true);
    expect(savedCopyOf(queryClient).some((key) => key.includes("profile"))).toBe(false);
    api.answer("organization.profile.update", { data: { ...banked, updatedAt: "2026-10-16T06:00:00.000Z" } });
    await userEvent.click(screen.getByRole("button", { name: messages.common.save }));
    await waitFor(() => {
      expect(inputsSentTo("organization.profile.update")).toHaveLength(1);
    });
    expect(savedCopyOf(queryClient).some((key) => key.includes("profile"))).toBe(false);
  });

  it("keeps what is being typed when a newer profile arrives from elsewhere", async () => {
    const { queryClient } = renderScreen(saved);
    await userEvent.type(await screen.findByLabelText(words.address), "12 Hill Road");
    act(() => {
      queryClient.setQueryData(profileQueryOf(queryClient), {
        ...saved,
        legalName: "Konkan Trails Private Limited",
        updatedAt: "2026-10-16T06:00:00.000Z",
      });
    });
    await waitFor(() => {
      expect(screen.getByLabelText(words.legalName)).toHaveValue("Konkan Trails Private Limited");
    });
    expect(screen.getByLabelText(words.address)).toHaveValue("12 Hill Road");
  });

  it("shows +91 only before a number without its own country code", async () => {
    renderScreen({ ...saved, contactPhone: "+442079460958" });
    const phone = await screen.findByLabelText(words.contactPhone);
    expect(phone).toHaveValue("+442079460958");
    expect(screen.queryByText("+91")).toBeNull();
    await userEvent.clear(phone);
    await userEvent.type(phone, "98200");
    expect(screen.getByText("+91")).toBeVisible();
    await userEvent.clear(phone);
    await userEvent.type(phone, "+44 20");
    expect(screen.queryByText("+91")).toBeNull();
    // The same box all along: typing never loses its place.
    expect(phone).toHaveFocus();
    expect(phone).toHaveValue("+44 20");
  });
});
