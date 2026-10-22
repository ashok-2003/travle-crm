// The visitor's enquiry form (spec 3.5, W36, W41): only the fields the agency set, in order; the answers as the contract
// takes them; the honeypot, the colour and the preview; a refusal kept under the button with what was typed.
import { websiteEnquiryInput, type WebsiteEnquiryInput } from "@travel-crm/contracts/website-forms";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormRefusal } from "@/website-form/refusal";
import { WebsiteFormView } from "@/website-form/website-form-view";
import { kashmirId, publicFormOf, renderForm } from "./support";

const sent = (send: ReturnType<typeof vi.fn>, call = 0) => send.mock.calls[call]?.[0] as WebsiteEnquiryInput;

function show(changes = {}, mode: "hosted" | "embedded" | "preview" = "hosted", send = vi.fn(() => Promise.resolve())) {
  renderForm(<WebsiteFormView form={publicFormOf(changes)} mode={mode} send={send} />);
  return send;
}

async function fill(label: string, text: string): Promise<void> {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.paste(text);
}

async function choose(label: string, option: RegExp | string): Promise<void> {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

async function fillTheBasics(): Promise<void> {
  await fill("Your name", "Rahul Sharma");
  await fill("Phone", "98765 43210");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the fields", () => {
  it("shows only the fields the agency set and in order", () => {
    show({
      fields: {
        email: "optional",
        destination: "off",
        travelMonth: "optional",
        travellers: "off",
        budget: "off",
        message: "required",
      },
    });
    const labels = screen.getAllByText(/^(Your name|Phone|Email|When\?|Anything else we should know\?)$/);
    expect(labels.map((label) => label.textContent)).toEqual([
      "Your name",
      "Phone",
      "Email",
      "When?",
      "Anything else we should know?",
    ]);
    expect(screen.queryByText("Where would you like to go?")).toBeNull();
    expect(screen.queryByText("Budget")).toBeNull();
    expect(screen.queryByText("Adults")).toBeNull();
  });

  it("asks for a name and a phone, and shows a bad phone's sentence under the field", async () => {
    const send = show();
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(await screen.findAllByText("Please fill this in.")).toHaveLength(2);
    await fill("Your name", "Rahul");
    await fill("Phone", "12");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(await screen.findByText("Use a phone number like 98765 43210")).toBeVisible();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a typed destination after Somewhere else", async () => {
    const send = show();
    await fillTheBasics();
    await choose("Where would you like to go?", "Somewhere else");
    await fill("Which place?", "Spiti");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalled();
    });
    expect(sent(send).answers.destination).toEqual({ kind: "typed", text: "Spiti" });
  });

  it("sends a chosen destination, month and the default two adults", async () => {
    const send = show();
    await fillTheBasics();
    await choose("Where would you like to go?", "Kashmir");
    await choose("When?", "December 2026");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalled();
    });
    expect(sent(send).answers).toMatchObject({
      destination: { kind: "existing", destinationId: kashmirId },
      travelMonth: "2026-12",
      adults: 2,
      childrenAges: [],
    });
  });

  it("offers Not sure yet only while When? is optional", async () => {
    show({ fields: { ...publicFormOf().fields, travelMonth: "required" } });
    await userEvent.click(screen.getByRole("combobox", { name: "When?" }));
    expect(await screen.findByRole("option", { name: "I'm flexible" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Not sure yet" })).toBeNull();
  });

  it("asks an age for each child", async () => {
    const send = show();
    await fillTheBasics();
    await userEvent.click(screen.getByRole("button", { name: "More children" }));
    await userEvent.click(screen.getByRole("button", { name: "More children" }));
    expect(screen.getAllByRole("combobox", { name: /^Age of child/ })).toHaveLength(2);
    await choose("Age of child 1", "7");
    await choose("Age of child 2", "Under 1");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalled();
    });
    expect(sent(send).answers.childrenAges).toEqual([7, 0]);
  });

  it("sends the budget as whole rupees and a basis", async () => {
    const send = show();
    await fillTheBasics();
    await fill("Budget", "1,50,000");
    await choose("Budget is", "Per person");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalled();
    });
    expect(sent(send).answers.budget).toEqual({ rupees: 150000, basis: "per_person" });
  });

  it("builds a body the api's own schema takes, with one submission id for every attempt", async () => {
    const send = vi.fn(() => Promise.reject(new FormRefusal("FORM_TOO_FAST", 400)));
    show({}, "embedded", send);
    await fillTheBasics();
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalledTimes(1);
    });
    await userEvent.click(await screen.findByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalledTimes(2);
    });
    expect(websiteEnquiryInput.safeParse(sent(send, 0)).success).toBe(true);
    expect(sent(send, 0)).toMatchObject({ via: "embedded", openedToken: "opened.token", homepage: "" });
    expect(sent(send, 1).submissionId).toBe(sent(send, 0).submissionId);
  });
});

describe("the offers tickbox", () => {
  it("is absent while the form says offersTickbox false", () => {
    show({ offersTickbox: false });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("sends offers only when ticked, with the agency's name in the words", async () => {
    const send = show({ offersTickbox: true });
    await fillTheBasics();
    expect(
      screen.getByRole("checkbox", { name: "Send me travel offers and updates from Sharma Travels." }),
    ).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalled();
    });
    expect(sent(send).answers).not.toHaveProperty("offers");
  });
});

describe("the offers tickbox when ticked", () => {
  it("sends offers: true", async () => {
    const send = show({ offersTickbox: true });
    await fillTheBasics();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalled();
    });
    expect(sent(send).answers.offers).toBe(true);
  });
});

describe("the trap, the colour and the preview", () => {
  it("keeps the honeypot off screen, not display none, aria-hidden and not tabbable", () => {
    show();
    const trap = document.querySelector<HTMLInputElement>('input[name="homepage"]');
    expect(trap).not.toBeNull();
    expect(trap?.tabIndex).toBe(-1);
    expect(trap?.getAttribute("autocomplete")).toBe("off");
    const wrapper = trap?.closest("[aria-hidden='true']");
    if (!(wrapper instanceof HTMLElement)) throw new Error("the honeypot has no aria-hidden wrapper");
    expect(wrapper.className).toContain("absolute");
    expect(wrapper.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(getComputedStyle(wrapper).display).not.toBe("none");
    expect(within(wrapper).queryByRole("textbox")).toBeNull();
  });

  it("sets the colour as variables on the wrapper, not a class", () => {
    show({ colour: { primary: "#7a2e1d", ink: "#ffffff" } });
    const wrapper = screen
      .getByRole("form", { name: "Plan your trip with Sharma Travels" })
      .closest("[data-slot='website-form']");
    expect((wrapper as HTMLElement).style.getPropertyValue("--primary")).toBe("#7a2e1d");
    expect((wrapper as HTMLElement).style.getPropertyValue("--primary-foreground")).toBe("#ffffff");
    expect((wrapper as HTMLElement).style.getPropertyValue("--ring")).toBe("#7a2e1d");
  });

  it("disables Send in the preview and says nothing is sent", () => {
    const send = show({}, "preview");
    expect(screen.getByRole("button", { name: "Send enquiry" })).toBeDisabled();
    expect(screen.getByText("Nothing is sent from the preview.")).toBeVisible();
    expect(send).not.toHaveBeenCalled();
  });

  it("names the agency and links its privacy page", () => {
    show({ privacyUrl: "https://sharma.example/privacy" });
    expect(screen.getByText(/Your details go to Sharma Travels/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "https://sharma.example/privacy");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("sending", () => {
  it("shows Sending… and, after 15 seconds, the still-sending line", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    show(
      {},
      "hosted",
      vi.fn(() => new Promise<void>(() => undefined)),
    );
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Rahul" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "98765 43210" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Send enquiry" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(screen.queryByText("Still sending. Please keep this page open.")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByText("Still sending. Please keep this page open.")).toBeVisible();
  });

  it("shows a refusal's sentence once above the button and keeps what was typed", async () => {
    show(
      {},
      "hosted",
      vi.fn(() => Promise.reject(new FormRefusal("FORM_LINKS_NOT_ALLOWED", 400))),
    );
    await fillTheBasics();
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please take the web links out of your message.");
    expect(screen.getByLabelText("Your name")).toHaveValue("Rahul Sharma");
  });

  it("says something went wrong for a failure it has no sentence for", async () => {
    show(
      {},
      "hosted",
      vi.fn(() => Promise.reject(new FormRefusal(null, 400))),
    );
    await fillTheBasics();
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side. Please try again in a minute.",
    );
  });
});
