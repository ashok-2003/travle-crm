// "Fill it for me" on a form: the button is offered only where the AI is on; the proposal is reviewed (empty fields ticked,
// filled ones not, with before and after); Apply fills the open form in violet without saving; editing a field ends its
// violet; Undo restores the form; the save carries the fill and the applied fields.
import type { AiFillProposal } from "@travel-crm/contracts/ai";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FillWithAi } from "@/ai/fill/fill-with-ai";
import { leadConverter } from "@/ai/fill/fill-converters";
import { AiMark } from "@/ai/fill/ai-mark";
import { FillMarksProvider, useFillMarks } from "@/ai/fill/use-fill-marks";
import { TextField } from "@/components/forms/text-field";
import { useForm } from "react-hook-form";
import { emptyLeadValues, type LeadFormValues } from "@/leads/form/lead-form-values";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

const proposal: AiFillProposal = {
  fillId: "0199a000-0000-7000-8000-0000000000f1",
  fields: [
    { path: "person.name", value: "Rahul Sharma", from: "text", excerpt: "Rahul Sharma ji" },
    { path: "trip.departureCity", value: "Delhi", from: "text", excerpt: "Delhi se" },
  ],
  questions: ["Which month?"],
  truncated: false,
  usedThisMonth: 1,
  monthlyLimit: 3000,
};

let sent: unknown = null;

function Harness() {
  const form = useForm<LeadFormValues>({ defaultValues: { ...emptyLeadValues("me"), departureCity: "Jaipur" } });
  const marks = useFillMarks(form, leadConverter);
  return (
    <FillMarksProvider marks={marks}>
      <FillWithAi target="lead" marks={marks} />
      <AiMark paths={["person.name"]}>
        <TextField control={form.control} name="name" label="Name" />
      </AiMark>
      <AiMark paths={["trip.departureCity"]}>
        <TextField control={form.control} name="departureCity" label="Leaving from" />
      </AiMark>
      <button
        type="button"
        onClick={() => {
          sent = marks.use();
        }}
      >
        Save
      </button>
    </FillMarksProvider>
  );
}

function render(permissions = ["ai:suggest", "leads:create"], modules = ["crm", "ai"], enabled = true) {
  screenIs("wide");
  stubApi({ "ai.status": { data: { enabled } }, "ai.fill.lead": { data: proposal } });
  const queryClient = newQueryClient({ ...paidSubscription, modules: modules as never });
  renderWithApi(<Harness />, queryClient, member({ permissions }));
}

describe("Fill with AI", () => {
  it("is not offered when the plan, the agency's switch or the role doesn't have the AI", async () => {
    render(["ai:suggest", "leads:create"], ["crm"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: "Fill with AI" })).toBeNull();
  });

  it("proposes, ticks what is empty, applies in violet without saving, ends the violet on an edit, and undoes", async () => {
    const user = userEvent.setup();
    sent = null;
    render();
    await user.click(await screen.findByRole("button", { name: "Fill with AI" }));
    await user.type(screen.getByLabelText("What you know"), "Rahul Sharma ji, Delhi se");
    await user.click(screen.getByRole("button", { name: "Fill the form" }));

    // The proposal: the empty name is ticked; the departure city already holds Jaipur, so it is not, and shows before and after.
    const name = await screen.findByRole("checkbox", { name: /Name/ });
    expect(name).toBeChecked();
    const city = screen.getByRole("checkbox", { name: /Leaving from/ });
    expect(city).not.toBeChecked();
    expect(screen.getByText(/Now: Jaipur\./)).toBeInTheDocument();
    expect(screen.getByText("Which month?")).toBeInTheDocument();

    await user.click(city);
    await user.click(screen.getByRole("button", { name: "Apply 2" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Rahul Sharma");
    expect(screen.getByLabelText("Leaving from")).toHaveValue("Delhi");
    // Both are marked in violet, with where they came from.
    expect(document.querySelectorAll("[data-ai-filled]")).toHaveLength(2);
    expect(screen.getAllByText("Filled by AI from your words")).toHaveLength(2);

    // Typing in one ends its violet; the other keeps it.
    await user.type(screen.getByLabelText("Name"), "!");
    await waitFor(() => {
      expect(document.querySelectorAll("[data-ai-filled]")).toHaveLength(1);
    });

    // The save would carry the fill and the applied paths, whether or not the person then changed them.
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toEqual({ fillId: proposal.fillId, paths: ["person.name", "trip.departureCity"] });

    // Undo restores the form as it was before Apply.
    await user.click(screen.getByRole("button", { name: "Undo AI fill" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Leaving from")).toHaveValue("Jaipur");
    expect(document.querySelectorAll("[data-ai-filled]")).toHaveLength(0);
    expect(within(document.body).queryByRole("button", { name: "Undo AI fill" })).toBeNull();
  });
});
