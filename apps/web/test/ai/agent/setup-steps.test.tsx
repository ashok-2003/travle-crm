// The Setup tab's editors: each saves the input the api takes, refuses in words, and refreshes the checklist.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentScreen } from "@/ai/agent/agent-screen";
import { messages } from "@/i18n/messages";
import { address } from "../../leads/navigation";
import { newQueryClient, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { recordingApi, type Answer } from "./setup-api";

vi.mock("next/navigation", () => import("../../leads/navigation"));
const uploaded = vi.hoisted(() => vi.fn());
vi.mock("@/files/upload", () => ({ uploadFile: uploaded }));

const t = messages.aiAgent.setup;
const adId = "0199a000-0000-7000-8000-0000000000a1";
const packageId = "0199a000-0000-7000-8000-0000000000b1";
const checklist = {
  steps: ["whatsapp", "packages", "payment", "answers", "basics", "ads"].map((key) => ({
    key,
    done: false,
    optional: key === "ads",
    count: null,
    total: null,
  })),
  ready: false,
  on: false,
  pausedBySupport: false,
};
const details = {
  upiId: null,
  bankName: null,
  accountName: null,
  accountNumber: null,
  ifsc: null,
  qr: null,
  ready: false,
};

function open(title: string, answers: Record<string, Answer>) {
  address.set("/ai-agent?tab=setup");
  const api = recordingApi({ "ai.agentSetup": { data: checklist }, ...answers });
  renderWithApi(<AgentScreen />, newQueryClient());
  return { api, edit: () => screen.findByRole("button", { name: `Edit ${title}` }).then((b) => userEvent.click(b)) };
}

beforeEach(() => {
  screenIs("wide");
  uploaded.mockReset();
  // Radix's Select reaches for pointer capture and scrolling, which jsdom lacks.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

describe("the payment editor", () => {
  it("asks for the business details first when there is no profile", async () => {
    const { edit } = open(t.steps.payment.title, { "organization.profile.get": { data: null } });
    await edit();
    expect(await screen.findByRole("link", { name: t.payment.profileFirst })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(screen.queryByRole("button", { name: t.payment.save })).not.toBeInTheDocument();
  });

  it("saves the five fields and asks for the checklist again", async () => {
    const { api, edit } = open(t.steps.payment.title, {
      "organization.profile.get": { data: { id: "p" } },
      "organization.paymentDetails.get": { data: details },
      "organization.paymentDetails.save": { data: details },
    });
    await edit();
    await userEvent.type(await screen.findByLabelText(t.payment.upiId), "asha@okbank");
    await userEvent.type(screen.getByLabelText(t.payment.bankName), "Bank");
    await userEvent.type(screen.getByLabelText(t.payment.accountName), "Asha Travels");
    await userEvent.type(screen.getByLabelText(t.payment.accountNumber), "001234567890");
    await userEvent.type(screen.getByLabelText(t.payment.ifsc), "hdfc0001234");
    await userEvent.click(screen.getByRole("button", { name: t.payment.save }));
    await waitFor(() => {
      expect(api.sent("organization.paymentDetails.save")).toEqual([
        {
          upiId: "asha@okbank",
          bankName: "Bank",
          accountName: "Asha Travels",
          accountNumber: "001234567890",
          ifsc: "HDFC0001234",
        },
      ]);
    });
    await waitFor(() => {
      expect(api.calls.filter((call) => call.path === "ai.agentSetup").length).toBeGreaterThan(1);
    });
  });

  it("says a wrong UPI ID on its field and sends nothing", async () => {
    const { api, edit } = open(t.steps.payment.title, {
      "organization.profile.get": { data: { id: "p" } },
      "organization.paymentDetails.get": { data: details },
    });
    await edit();
    await userEvent.type(await screen.findByLabelText(t.payment.upiId), "nonsense");
    await userEvent.click(screen.getByRole("button", { name: t.payment.save }));
    expect(await screen.findByText(t.payment.problems.upiId)).toBeInTheDocument();
    expect(api.sent("organization.paymentDetails.save")).toEqual([]);
  });

  it("shows a refusal in words", async () => {
    const { api, edit } = open(t.steps.payment.title, {
      "organization.profile.get": { data: { id: "p" } },
      "organization.paymentDetails.get": { data: details },
    });
    api.answer("organization.paymentDetails.save", { status: 409, reason: "PROFILE_NOT_SAVED" });
    await edit();
    await userEvent.type(await screen.findByLabelText(t.payment.bankName), "Bank");
    await userEvent.click(screen.getByRole("button", { name: t.payment.save }));
    expect(await screen.findByText(messages.errors.reasons.PROFILE_NOT_SAVED)).toBeInTheDocument();
  });

  it("sends the QR: ask, upload, confirm", async () => {
    const { api, edit } = open(t.steps.payment.title, {
      "organization.profile.get": { data: { id: "p" } },
      "organization.paymentDetails.get": { data: details },
      "organization.paymentDetails.requestQrUpload": { data: { attachmentId: adId, upload: { url: "u" } } },
      "organization.paymentDetails.confirmQr": { data: details },
    });
    await edit();
    await screen.findByLabelText(t.payment.upiId);
    await userEvent.upload(screen.getByTestId("payment-qr-input"), new File(["png"], "qr.png", { type: "image/png" }));
    await waitFor(() => {
      expect(api.sent("organization.paymentDetails.confirmQr")).toEqual([{ attachmentId: adId }]);
    });
    expect(api.sent("organization.paymentDetails.requestQrUpload")).toEqual([
      { fileName: "qr.png", contentType: "image/png", sizeBytes: 3 },
    ]);
    expect(uploaded).toHaveBeenCalledTimes(1);
  });

  it("removes a QR after asking", async () => {
    const withQr = { ...details, qr: { id: adId, fileName: "qr.png", url: "https://files.test/qr.png" } };
    const { api, edit } = open(t.steps.payment.title, {
      "organization.profile.get": { data: { id: "p" } },
      "organization.paymentDetails.get": { data: withQr },
      "organization.paymentDetails.removeQr": { data: details },
    });
    await edit();
    await userEvent.click(await screen.findByRole("button", { name: `Remove qr.png` }));
    await userEvent.click(await screen.findByRole("button", { name: t.payment.remove }));
    await waitFor(() => {
      expect(api.sent("organization.paymentDetails.removeQr")).toEqual([{ attachmentId: adId }]);
    });
  });
});

describe("the answers, name and tone, and ads editors", () => {
  it("saves the answers typed", async () => {
    const { api, edit } = open(t.steps.answers.title, {
      "ai.agencyAnswers": { data: { refunds: "In 7 days" } },
      "ai.saveAgencyAnswers": { data: {} },
    });
    await edit();
    const box = await screen.findByLabelText(messages.aiAgent.answers.questions.cancellation);
    expect(screen.getByLabelText(messages.aiAgent.answers.questions.refunds)).toHaveValue("In 7 days");
    await userEvent.type(box, "Free until 30 days");
    await userEvent.click(screen.getByRole("button", { name: t.answers.save }));
    await waitFor(() => {
      expect(api.sent("ai.saveAgencyAnswers")).toEqual([
        {
          answers: {
            cancellation: "Free until 30 days",
            refunds: "In 7 days",
            id_documents: "",
            safety: "",
            children: "",
            payment_methods: "",
          },
        },
      ]);
    });
  });

  it("saves the name and tone, with the agency's team as the name's placeholder", async () => {
    const { api, edit } = open(t.steps.basics.title, {
      "ai.agentBasics": { data: { agentName: "", tone: "enthusiastic" } },
      "ai.saveAgentBasics": { data: { agentName: "Maya", tone: "professional" } },
    });
    await edit();
    const name = await screen.findByLabelText(t.basics.agentName);
    expect(name).toHaveAttribute("placeholder", expect.stringMatching(/ team$/));
    await userEvent.type(name, "Maya");
    await userEvent.click(screen.getByRole("radio", { name: t.basics.professional }));
    await userEvent.click(screen.getByRole("button", { name: t.basics.save }));
    await waitFor(() => {
      expect(api.sent("ai.saveAgentBasics")).toEqual([{ agentName: "Maya", tone: "professional" }]);
    });
  });

  it("says when no chat has come from an ad", async () => {
    const { edit } = open(t.steps.ads.title, { "ai.ads": { data: [] }, "quotes.packages": { data: [] } });
    await edit();
    expect(await screen.findAllByText(t.ads.none)).not.toHaveLength(0);
  });

  it("links an ad to a package the moment it is chosen", async () => {
    const ad = {
      id: adId,
      headline: "Spiti in June",
      sourceUrl: null,
      packageId: null,
      chats: 3,
      lastSeenAt: "2026-11-10T05:00:00.000Z",
    };
    const { api, edit } = open(t.steps.ads.title, {
      "ai.ads": { data: [ad] },
      "quotes.packages": { data: [{ id: packageId, name: "Spiti 6 days" }] },
      "ai.linkAd": { data: null },
    });
    await edit();
    await userEvent.click(await screen.findByRole("combobox", { name: /Spiti in June/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Spiti 6 days" }));
    await waitFor(() => {
      expect(api.sent("ai.linkAd")).toEqual([{ adId, packageId }]);
    });
  });
});
