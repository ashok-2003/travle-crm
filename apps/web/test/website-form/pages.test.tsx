// The hosted and embedded pages (spec 3.5-3.8, 5.1, W29, W31, W42): the form for a good key, the waking words, the closed
// and missing states, the thank-you, the retry of a 5xx with the same submission id, the embed's height message, and that
// nothing is stored and no tRPC call is made.
import type { WebsiteFormPublic } from "@travel-crm/contracts/website-forms";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { hostedFormMetadata } from "@/website-form/form-metadata";
import { FormPage } from "@/website-form/form-page";
import { embeddedOnOf } from "@/website-form/use-public-form";
import { metadata as embeddedMetadata } from "../../src/app/embed/[key]/layout";
import { metadata as hostedMetadata } from "../../src/app/f/[key]/layout";
import { publicFormOf, renderForm } from "./support";

// The server-side translator, which a Client Component test cannot reach, from the same messages.
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "websiteForm.page") =>
    Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

const key = "AAAAAAAAAAAAAAAAAAAAAA" + "bbbbbbbbbbbbbbbb";
const open: WebsiteFormPublic = { available: true, form: publicFormOf() };
const closed: WebsiteFormPublic = {
  available: false,
  form: {
    organizationName: "Sharma Travels",
    logoUrl: null,
    websiteUrl: "https://sharma.example",
    websiteButtonText: "Back to our website",
  },
};

interface Reply {
  status: number;
  body?: unknown;
}
const json = ({ status, body }: Reply) => new Response(body === undefined ? null : JSON.stringify(body), { status });

/** Stubs fetch: GETs answer with `form`, POSTs with the next of `posts` (the last repeats). Returns the calls. */
function serve(form: Reply | "never", posts: Reply[] = [{ status: 201, body: { ok: true } }]) {
  let sent = 0;
  const calls = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method !== "POST")
      return form === "never" ? new Promise<Response>(() => undefined) : Promise.resolve(json(form));
    const reply = posts[Math.min(sent, posts.length - 1)] ?? { status: 201 };
    sent += 1;
    return Promise.resolve(json(reply));
  });
  vi.stubGlobal("fetch", calls);
  return calls;
}

const sentShape = z.object({ openedToken: z.string(), submissionId: z.string() });

const posted = (calls: ReturnType<typeof serve>) =>
  calls.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => sentShape.parse(JSON.parse(typeof init?.body === "string" ? init.body : "{}")));

async function fillAndSend(): Promise<void> {
  await userEvent.click(await screen.findByLabelText("Your name"));
  await userEvent.paste("Rahul Sharma");
  await userEvent.click(screen.getByLabelText("Phone"));
  await userEvent.paste("98765 43210");
  await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loading", () => {
  it("renders the form for a good key, asking the public route and no other", async () => {
    const calls = serve({ status: 200, body: open });
    renderForm(<FormPage formKey={key} mode="hosted" />);
    expect(await screen.findByLabelText("Your name")).toBeVisible();
    expect(calls).toHaveBeenCalledWith(
      `/api/public/website-forms/${key}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(calls.mock.calls.every(([url]) => url.startsWith("/api/public/website-forms/"))).toBe(true);
  });

  it("says the form is getting ready after six seconds without an answer", async () => {
    vi.useFakeTimers();
    serve("never");
    renderForm(<FormPage formKey={key} mode="hosted" />);
    expect(screen.queryByText(/Getting the form ready/)).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(screen.getByText("Getting the form ready. This can take a minute.")).toBeVisible();
  });

  it("keeps asking while the api sleeps and then shows the form", async () => {
    vi.useFakeTimers();
    let asked = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(json(++asked < 3 ? { status: 503 } : { status: 200, body: open }))),
    );
    renderForm(<FormPage formKey={key} mode="hosted" />);
    await act(() => vi.advanceTimersByTimeAsync(7_000));
    expect(screen.getByLabelText("Your name")).toBeVisible();
  });

  it("shows only its sentence, the name and the website button for a closed form", async () => {
    serve({ status: 200, body: closed });
    renderForm(<FormPage formKey={key} mode="hosted" />);
    expect(await screen.findByText("This form isn't taking enquiries right now.")).toBeVisible();
    expect(screen.getByText("Sharma Travels")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to our website" })).toHaveAttribute("href", "https://sharma.example");
    expect(screen.queryByLabelText("Your name")).toBeNull();
  });

  it("shows only its sentence for a key that does not exist", async () => {
    serve({ status: 404, body: { reason: "FORM_NOT_FOUND" } });
    renderForm(<FormPage formKey={key} mode="hosted" />);
    expect(await screen.findByText("This form link doesn't work any more.")).toBeVisible();
    expect(screen.queryByText("Sharma Travels")).toBeNull();
  });
});

describe("sending", () => {
  it("replaces the form with the thank-you and the website button, and a second send needs a reload", async () => {
    const calls = serve({ status: 200, body: open });
    renderForm(<FormPage formKey={key} mode="hosted" />);
    await fillAndSend();
    expect(await screen.findByText("Thank you. We will call you soon.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to our website" })).toHaveAttribute("target", "_self");
    expect(screen.queryByRole("button", { name: "Send enquiry" })).toBeNull();
    expect(posted(calls)).toHaveLength(1);
  });

  it("sets the website button to leave the frame in the embed", async () => {
    serve({ status: 200, body: open });
    renderForm(<FormPage formKey={key} mode="embedded" />);
    await fillAndSend();
    expect(await screen.findByRole("link", { name: "Back to our website" })).toHaveAttribute("target", "_top");
  });

  it("retries a 503 once with the same body", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = serve({ status: 200, body: open }, [{ status: 503 }, { status: 201, body: { ok: true } }]);
    renderForm(<FormPage formKey={key} mode="hosted" />);
    await act(() => vi.advanceTimersByTimeAsync(10));
    await fillAndSend();
    await waitFor(() => {
      expect(posted(calls)).toHaveLength(1);
    });
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(await screen.findByText("Thank you. We will call you soon.")).toBeVisible();
    const [first, second] = posted(calls);
    expect(second).toEqual(first);
  });

  it("shows the api's sentence for a refusal and never a thank-you", async () => {
    serve({ status: 200, body: open }, [{ status: 403, body: { reason: "FORM_UNAVAILABLE" } }]);
    renderForm(<FormPage formKey={key} mode="hosted" />);
    await fillAndSend();
    expect(await screen.findByRole("alert")).toHaveTextContent("This form isn't taking enquiries right now.");
    expect(screen.queryByText("Thank you")).toBeNull();
  });

  it("gets a new token itself and sends again after FORM_EXPIRED", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fresh: WebsiteFormPublic = { available: true, form: publicFormOf({ openedToken: "fresh.token" }) };
    const answers = [json({ status: 200, body: open }), json({ status: 200, body: fresh })];
    const posts = [
      { status: 400, body: { reason: "FORM_EXPIRED" } },
      { status: 201, body: { ok: true } },
    ];
    let sent = 0;
    const calls = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "POST"
          ? json(posts[sent++] ?? { status: 201 })
          : (answers.shift() ?? json({ status: 200, body: fresh })),
      ),
    );
    vi.stubGlobal("fetch", calls);
    renderForm(<FormPage formKey={key} mode="hosted" />);
    await act(() => vi.advanceTimersByTimeAsync(10));
    await fillAndSend();
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(await screen.findByText("Thank you. We will call you soon.")).toBeVisible();
    const bodies = posted(calls);
    expect(bodies.map((body) => body.openedToken)).toEqual(["opened.token", "fresh.token"]);
    expect(bodies.map((body) => body.submissionId)).toHaveLength(2);
    expect(new Set(bodies.map((body) => body.submissionId)).size).toBe(1);
  });
});

describe("the embed", () => {
  it("posts its height to the page around it whenever it changes", async () => {
    let observed: (() => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observed = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const post = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    serve({ status: 200, body: open });
    renderForm(<FormPage formKey={key} mode="embedded" />);
    await screen.findByLabelText("Your name");
    expect(post).toHaveBeenCalledWith({ type: "travel-crm-form:height", height: expect.any(Number) as number }, "*");
    post.mockClear();
    act(() => observed?.());
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("names the host it is embedded on, or says Embedded", () => {
    expect(embeddedOnOf("https://www.sharma.example/trips?x=1")).toBe("www.sharma.example");
    expect(embeddedOnOf("")).toBe("Embedded");
    expect(embeddedOnOf("not a url")).toBe("Embedded");
    expect(embeddedOnOf(`https://${"a".repeat(90)}.example/`)).toBe("Embedded");
  });
});

describe("what it never does", () => {
  it("touches no cookie, localStorage or IndexedDB, and makes no tRPC request", async () => {
    const cookie = vi.spyOn(document, "cookie", "set");
    const stored = vi.spyOn(Storage.prototype, "setItem");
    const read = vi.spyOn(Storage.prototype, "getItem");
    const open_ = vi.fn();
    vi.stubGlobal("indexedDB", { open: open_ });
    const calls = serve({ status: 200, body: open });
    renderForm(<FormPage formKey={key} mode="hosted" />);
    await fillAndSend();
    await screen.findByText("Thank you. We will call you soon.");
    expect(cookie).not.toHaveBeenCalled();
    expect(stored).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(open_).not.toHaveBeenCalled();
    expect(calls.mock.calls.some(([url]) => url.includes("/trpc"))).toBe(false);
  });

  it("is not indexed", () => {
    expect(hostedMetadata.robots).toEqual({ index: false, follow: false });
    expect(embeddedMetadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("the title", () => {
  it("names the agency when the api answers in time, and is generic when it does not", async () => {
    vi.stubEnv("API_ORIGIN", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(json({ status: 200, body: open }))),
    );
    expect(await hostedFormMetadata(key)).toEqual({ title: { absolute: "Plan your trip with Sharma Travels" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("asleep"))),
    );
    expect(await hostedFormMetadata(key)).toEqual({ title: { absolute: "Enquiry form" } });
    vi.unstubAllEnvs();
  });
});
