// "Draft the days" on a quote: a second violet button beside Fill with AI that needs no words; the proposal lists the days, says
// when an amount was taken out, and (with days already on the quote) offers to replace them all, unticked, showing what is there;
// Apply puts the days in the open form in violet and nothing is saved.
import type { AiFillProposal } from "@travel-crm/contracts/ai";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { quoteConverter } from "@/ai/fill/fill-converters";
import { FillWithAi } from "@/ai/fill/fill-with-ai";
import { FillMarksProvider, useFillMarks } from "@/ai/fill/use-fill-marks";
import { TextField } from "@/components/forms/text-field";
import type { QuoteFormValues } from "@/quotes/quote-form-values";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

const proposal: AiFillProposal = {
  fillId: "0199a000-0000-7000-8000-0000000000f2",
  fields: [
    {
      path: "quote.days",
      value: [
        { title: "Arrive in Manali", description: "Check in." },
        { title: "Solang Valley", description: "Snow play." },
      ],
      from: "package",
      excerpt: "Manali 5N",
    },
  ],
  questions: ["The AI wrote 2 of the 3 days: add the rest yourself"],
  truncated: false,
  removedAmounts: true,
  usedThisMonth: 1,
  monthlyLimit: 3000,
};

const values = (days: QuoteFormValues["days"]): QuoteFormValues => ({
  title: "",
  startDate: "",
  adults: "2",
  children: "0",
  days,
  items: [],
  taxRate: "500",
  placeOfSupply: "own",
  inclusions: "",
  exclusions: "",
  notes: "",
});

function Harness({ days }: { days: QuoteFormValues["days"] }) {
  const form = useForm<QuoteFormValues>({ defaultValues: values(days) });
  const marks = useFillMarks(form, quoteConverter);
  return (
    <FillMarksProvider marks={marks}>
      <FillWithAi target="quote" subjectId="q1" marks={marks} />
      <FillWithAi target="quote_days" subjectId="q1" marks={marks} withUndo={false} />
      <TextField control={form.control} name="days.0.title" label="Day 1" />
    </FillMarksProvider>
  );
}

function render(days: QuoteFormValues["days"]) {
  screenIs("wide");
  stubApi({ "ai.status": { data: { enabled: true } }, "ai.fill.quoteDays": { data: proposal } });
  const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "ai"] as never });
  renderWithApi(<Harness days={days} />, queryClient, member({ permissions: ["ai:suggest", "quotes:edit"] }));
}

/** What the browser sent to a procedure. */
function sentTo(path: string): unknown {
  for (const [input, init] of vi.mocked(fetch).mock.calls) {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes(path)) continue;
    const body = init?.body ?? undefined;
    return typeof body === "string" ? JSON.parse(body) : undefined;
  }
  return undefined;
}

describe("Draft the days", () => {
  it("drafts with no words, replaces the days only when ticked, says an amount was taken out, and saves nothing", async () => {
    const user = userEvent.setup();
    render([{ title: "Old plan", description: "" }]);
    // Beside Fill with AI, both violet.
    expect(await screen.findByRole("button", { name: "Fill with AI" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Draft the days" }));
    // No words are needed: the draft button inside the sheet is enabled at once.
    const inSheet = within(await screen.findByRole("dialog")).getByRole("button", { name: "Draft the days" });
    expect(inSheet).toBeEnabled();
    await user.click(inSheet);

    expect(await screen.findByText(/an amount of its own and it was taken out/)).toBeInTheDocument();
    expect(screen.getByText("The AI wrote 2 of the 3 days: add the rest yourself")).toBeInTheDocument();
    expect(screen.getByText("Arrive in Manali")).toBeInTheDocument();
    expect(screen.getByText("Solang Valley")).toBeInTheDocument();
    expect(screen.getByText(/From your packages: “Manali 5N”/)).toBeInTheDocument();
    // Days are already on the quote: replacing them is a choice, unticked, with what is there.
    const replace = screen.getByRole("checkbox", { name: /Replace all days/ });
    expect(replace).not.toBeChecked();
    expect(screen.getByText(/Now: 1 day\./)).toBeInTheDocument();
    expect(sentTo("ai.fill.quoteDays")).toMatchObject({
      "0": { target: "quote_days", subjectId: "q1", source: { kind: "none" } },
    });

    await user.click(replace);
    await user.click(screen.getByRole("button", { name: "Apply 1" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Day 1")).toHaveValue("Arrive in Manali");
    });
    expect(document.querySelectorAll("[data-ai-filled]")).toHaveLength(0);
  });

  it("is not offered to a member who may not edit quotes", async () => {
    screenIs("wide");
    stubApi({ "ai.status": { data: { enabled: true } } });
    const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "ai"] as never });
    renderWithApi(<Harness days={[]} />, queryClient, member({ permissions: ["ai:suggest"] }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: "Draft the days" })).toBeNull();
  });
});
