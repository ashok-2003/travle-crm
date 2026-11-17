// A package's brochures: each shows the owner's name and description, and the Describe dialog saves them.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackageFilesCard } from "@/packages/package-files-card";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const words = messages.packages.files;
const packageId = "0190a000-0000-7000-8000-0000000000b1";
const described = {
  attachmentId: "0190a000-0000-7000-8000-0000000000c1",
  fileName: "kedarnath.pdf",
  contentType: "application/pdf",
  url: "https://files.example/kedarnath.pdf",
  name: "Kedarnath 6 days",
  description: "Day by day, with hotels",
};
const plain = {
  ...described,
  attachmentId: "0190a000-0000-7000-8000-0000000000c2",
  fileName: "spiti.pdf",
  name: null,
  description: null,
};

async function renderCard(brochures: unknown[], queryClient = newQueryClient()) {
  const api = fakeApi();
  renderWithApi(<PackageFilesCard packageId={packageId} />, queryClient);
  await waitFor(() => {
    expect(api.calls).toHaveLength(1);
  });
  api.last().answer({ brochures });
  return api;
}

describe("PackageFilesCard brochures", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows each brochure's name and description, and says when there are none", async () => {
    await renderCard([described, plain]);
    expect(await screen.findByText("Kedarnath 6 days")).toBeTruthy();
    expect(screen.getByText("Day by day, with hotels")).toBeTruthy();
    expect(screen.getByText(words.noName)).toBeTruthy();
    expect(screen.getByText(words.noDescription)).toBeTruthy();
    expect(screen.getByRole("link", { name: /kedarnath\.pdf/ })).toHaveAttribute("href", described.url);
  });

  it("describes a brochure and shows the saved words", async () => {
    const api = await renderCard([plain]);
    await userEvent.click(await screen.findByRole("button", { name: "Describe spiti.pdf" }));
    await userEvent.type(await screen.findByLabelText(words.details.name), "Spiti 8 days");
    await userEvent.type(screen.getByLabelText(words.details.description), "Winter trip");
    await userEvent.click(screen.getByRole("button", { name: words.details.save }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    expect(api.last().path).toBe("packages.describeFile");
    expect(api.last().input).toEqual({
      packageId,
      attachmentId: plain.attachmentId,
      name: "Spiti 8 days",
      description: "Winter trip",
    });
    api.last().answer({});
    await waitFor(() => {
      expect(api.calls).toHaveLength(3);
    });
    expect(api.last().path).toBe("packages.files");
    api.last().answer({ brochures: [{ ...plain, name: "Spiti 8 days", description: "Winter trip" }] });
    expect(await screen.findByText("Spiti 8 days")).toBeTruthy();
    expect(screen.getByText("Winter trip")).toBeTruthy();
  });

  it("keeps the dialog open and Cancel off while it saves", async () => {
    const api = await renderCard([described]);
    await userEvent.click(await screen.findByRole("button", { name: "Describe kedarnath.pdf" }));
    expect(await screen.findByLabelText(words.details.name)).toHaveValue("Kedarnath 6 days");
    await userEvent.click(screen.getByRole("button", { name: words.details.save }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("disables Describe when the subscription refuses changes", async () => {
    await renderCard([described], newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }));
    const button = await screen.findByRole("button", { name: "Describe kedarnath.pdf" });
    expect(button).toBeDisabled();
    expect(button.getAttribute("aria-describedby")).toContain("-write");
  });
});
