// Where customers pay on a group package: changed only by whoever manages settings, through procedures of their own.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PaymentsCard } from "@/packages/payments-card";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { member } from "../support/members";
import { aPackage } from "./detail";

const words = messages.packages.payments;
const group = aPackage({ kind: "group", paymentDetails: "UPI old@bank" });

describe("PaymentsCard", () => {
  it("saves the details through setPaymentDetails", async () => {
    const api = fakeApi();
    renderWithApi(<PaymentsCard detail={group} />, newQueryClient());
    const field = screen.getByRole("textbox", { name: words.details });
    await userEvent.clear(field);
    await userEvent.type(field, "UPI new@bank");
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "packages.setPaymentDetails")).toBe(true);
    });
    expect(api.calls.find((call) => call.path === "packages.setPaymentDetails")?.input).toEqual({
      packageId: group.id,
      paymentDetails: "UPI new@bank",
    });
  });

  it("sends the QR through the payment QR procedures", async () => {
    const api = fakeApi();
    renderWithApi(<PaymentsCard detail={group} />, newQueryClient());
    const file = new File(["png"], "qr.png", { type: "image/png" });
    await userEvent.upload(screen.getByTestId("package-qr-input"), file);
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "packages.requestPaymentQrUpload")).toBe(true);
    });
    expect(api.calls.find((call) => call.path === "packages.requestPaymentQrUpload")?.input).toEqual({
      packageId: group.id,
      fileName: "qr.png",
      contentType: "image/png",
      sizeBytes: 3,
    });
  });

  it("is disabled, with the manager-only line, for a member without settings access", () => {
    renderWithApi(<PaymentsCard detail={group} />, newQueryClient(), member({ permissions: ["quotes:edit"] }));
    expect(screen.getByRole("textbox", { name: words.details }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: words.save }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: words.addQr }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(words.managerOnly)).toBeTruthy();
  });

  it("refuses a QR that is not a picture or is over 2 MB, without sending anything", async () => {
    const api = fakeApi();
    renderWithApi(<PaymentsCard detail={group} />, newQueryClient());
    const input = screen.getByTestId("package-qr-input");
    await userEvent.upload(input, new File(["x"], "qr.pdf", { type: "application/pdf" }), { applyAccept: false });
    expect(await screen.findByText(words.problems.wrongType)).toBeTruthy();
    const big = new File(["x"], "qr.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 2 * 1024 * 1024 + 1 });
    await userEvent.upload(input, big);
    expect(await screen.findByText(/Choose a picture of up to 2 MB/)).toBeTruthy();
    expect(api.calls.some((call) => call.path === "packages.requestPaymentQrUpload")).toBe(false);
  });
});
