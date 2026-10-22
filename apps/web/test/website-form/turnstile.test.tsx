// Cloudflare Turnstile in the form (W39): optional and server-wide. No key, no script; with one, Send waits for the token,
// the token travels with the enquiry, and every refusal asks for a new one (a token works once).
import type { WebsiteEnquiryInput } from "@travel-crm/contracts/website-forms";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormRefusal } from "@/website-form/refusal";
import { WebsiteFormView } from "@/website-form/website-form-view";
import { publicFormOf, renderForm } from "./support";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const scripts = () => document.querySelectorAll(`script[src="${SCRIPT}"]`);

interface Options {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

/** A Turnstile that hands out tokens on demand: `solve` is the visitor passing the check. */
function stubTurnstile() {
  let options: Options | undefined;
  const turnstile = {
    render: vi.fn((_element: HTMLElement, given: Options) => {
      options = given;
      return "widget-1";
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  return {
    turnstile,
    /** The script arriving: window.turnstile exists only once it has loaded. */
    install: () => {
      Object.assign(window, { turnstile });
    },
    solve: (token: string) => {
      act(() => {
        options?.callback(token);
      });
    },
  };
}

async function loadScript(install?: () => void): Promise<void> {
  await waitFor(() => {
    expect(scripts()).toHaveLength(1);
  });
  act(() => {
    install?.();
    scripts()[0]?.dispatchEvent(new Event("load"));
  });
}

function show(
  send = vi.fn<(body: WebsiteEnquiryInput) => Promise<void>>(() => Promise.resolve()),
  siteKey: string | null = "site-key",
) {
  renderForm(<WebsiteFormView form={publicFormOf({ turnstileSiteKey: siteKey })} mode="hosted" send={send} />);
  return send;
}

async function fillIn(): Promise<void> {
  await userEvent.click(screen.getByLabelText("Your name"));
  await userEvent.paste("Rahul Sharma");
  await userEvent.click(screen.getByLabelText("Phone"));
  await userEvent.paste("98765 43210");
}

afterEach(() => {
  document.querySelectorAll(`script[src="${SCRIPT}"]`).forEach((script) => {
    script.remove();
  });
  Reflect.deleteProperty(window, "turnstile");
});

describe("the Turnstile widget", () => {
  it("loads no script when the form has no site key", async () => {
    show(undefined, null);
    await userEvent.click(screen.getByLabelText("Your name"));
    expect(scripts()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Send enquiry" })).toBeEnabled();
  });

  it("loads the script once, renders the widget with the site key and sends the token", async () => {
    const { turnstile, solve, install } = stubTurnstile();
    const send = show();
    await loadScript(install);
    expect(scripts()[0]).toHaveAttribute("async");
    expect(scripts()[0]).toHaveAttribute("defer");
    await waitFor(() => {
      expect(turnstile.render).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ sitekey: "site-key" }),
      );
    });
    await fillIn();
    expect(screen.getByRole("button", { name: "Send enquiry" })).toBeDisabled();
    solve("token-1");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalled();
    });
    expect(send.mock.calls[0]?.[0].turnstileToken).toBe("token-1");
  });

  it("asks for a new token after a bot-check refusal and shows its sentence", async () => {
    const { turnstile, solve, install } = stubTurnstile();
    show(vi.fn(() => Promise.reject(new FormRefusal("FORM_BOT_CHECK_FAILED", 400))));
    await loadScript(install);
    await waitFor(() => {
      expect(turnstile.render).toHaveBeenCalled();
    });
    await fillIn();
    solve("token-1");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't tell you are a person. Please try again.");
    expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
    expect(screen.getByRole("button", { name: "Send enquiry" })).toBeDisabled();
  });

  it("keeps the token after a refusal that came before the bot check", async () => {
    const { turnstile, solve, install } = stubTurnstile();
    const send = show(vi.fn(() => Promise.reject(new FormRefusal("FORM_TOO_FAST", 400))));
    await loadScript(install);
    await waitFor(() => {
      expect(turnstile.render).toHaveBeenCalled();
    });
    await fillIn();
    solve("token-1");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please check your details and press Send again.");
    expect(turnstile.reset).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(send).toHaveBeenCalledTimes(2);
    });
    expect(send.mock.calls[1]?.[0].turnstileToken).toBe("token-1");
  });

  it("gets a new token before an automatic resend and keeps the submission id", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { turnstile, solve, install } = stubTurnstile();
    const send = show(
      vi
        .fn<(body: WebsiteEnquiryInput) => Promise<void>>()
        .mockRejectedValueOnce(new FormRefusal(null, 503))
        .mockResolvedValue(undefined),
    );
    await loadScript(install);
    await waitFor(() => {
      expect(turnstile.render).toHaveBeenCalled();
    });
    await fillIn();
    solve("token-1");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
    });
    // The old token is not sent again: the resend waits for the widget's next one.
    await act(() => vi.advanceTimersByTimeAsync(3_100));
    expect(send).toHaveBeenCalledTimes(1);
    solve("token-2");
    await waitFor(() => {
      expect(send).toHaveBeenCalledTimes(2);
    });
    expect(send.mock.calls[1]?.[0].turnstileToken).toBe("token-2");
    expect(send.mock.calls[1]?.[0].submissionId).toBe(send.mock.calls[0]?.[0].submissionId);
    vi.useRealTimers();
  });

  it("shows the sentence if no new token comes for a resend", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { turnstile, solve, install } = stubTurnstile();
    const send = show(vi.fn(() => Promise.reject(new FormRefusal(null, 503))));
    await loadScript(install);
    await waitFor(() => {
      expect(turnstile.render).toHaveBeenCalled();
    });
    await fillIn();
    solve("token-1");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    await waitFor(() => {
      expect(turnstile.reset).toHaveBeenCalled();
    });
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our side");
    expect(send).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("never sends without a token: a script that cannot load shows the bot-check sentence and Try again", async () => {
    const { turnstile, install } = stubTurnstile();
    const send = show();
    await waitFor(() => {
      expect(scripts()).toHaveLength(1);
    });
    act(() => {
      scripts()[0]?.dispatchEvent(new Event("error"));
    });
    expect(await screen.findByText("We couldn't tell you are a person. Please try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send enquiry" })).toBeDisabled();
    expect(scripts()).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await loadScript(install);
    await waitFor(() => {
      expect(turnstile.render).toHaveBeenCalled();
    });
    expect(screen.queryByText("We couldn't tell you are a person. Please try again.")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("gives up on a script that never answers after ten seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    show();
    await act(() => vi.advanceTimersByTimeAsync(9_000));
    expect(screen.queryByText("We couldn't tell you are a person. Please try again.")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(screen.getByText("We couldn't tell you are a person. Please try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send enquiry" })).toBeDisabled();
    vi.useRealTimers();
  });

  it("shows no widget in the preview", () => {
    renderForm(<WebsiteFormView form={publicFormOf({ turnstileSiteKey: "site-key" })} mode="preview" send={vi.fn()} />);
    expect(scripts()).toHaveLength(0);
  });
});
