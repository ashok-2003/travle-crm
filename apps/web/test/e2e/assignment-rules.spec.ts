// Release 4, journey 3: a Kashmir rule sends a Kashmir enquiry to its person, whatever the mode, and the lead's
// timeline says which rule; a returning customer goes back to the owner of their earlier lead.
import { expect, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, callApi, leadInput, moveStageThroughApi } from "./support/leads";
import { salesTeam, saveSettings, websiteVisitors } from "./support/assignment";
import { newPhone } from "./support/website-form";

test("a Kashmir rule sends a Kashmir enquiry to its person; a returning customer goes to their previous owner", async ({
  page,
  request,
  agency,
  addStaff,
}) => {
  await signInByEmail(page, agency.owner);
  const team = await salesTeam(page, agency, addStaff);
  await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Nisha Menon", phone: "+919811100001" },
      trip: { destination: { kind: "new", name: "Kashmir" } },
    }),
  );
  const [kashmir] = await callApi<{ id: string; name: string }[]>(page, "destinations.search", { query: "Kashmir" });
  if (!kashmir) throw new Error("Kashmir was not made");
  await saveSettings(page, {
    rules: [{ source: null, destinationId: kashmir.id, tripType: null, assigneeUserId: team.ravi.userId }],
  });
  const visitors = await websiteVisitors(page, request);

  const enquiry = await visitors.enquire({
    name: "Meera Pillai",
    answers: { destination: { kind: "existing", destinationId: kashmir.id } },
  });
  expect(enquiry.ownerUserId).toBe(team.ravi.userId);
  await page.goto(`/leads/${enquiry.id}`);
  await expect(
    page.getByRole("list", { name: "Timeline" }).getByText("Assigned to Ravi Kumar by rule 1."),
  ).toBeVisible();

  // A customer Priya served before, whose lead is closed, asks again about somewhere else.
  const phone = newPhone();
  const earlier = await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Kiran Shah", phone: `+91${phone}` }, ownerUserId: team.priya.userId }),
  );
  await moveStageThroughApi(page, earlier, "won");
  const again = await visitors.enquire({ name: "Kiran Shah", phone });
  expect(again.ownerUserId).toBe(team.priya.userId);
  await page.goto(`/leads/${again.id}`);
  await expect(
    page
      .getByRole("list", { name: "Timeline" })
      .getByText("Assigned to Priya Nair, who owned this customer's earlier lead."),
  ).toBeVisible();
});
