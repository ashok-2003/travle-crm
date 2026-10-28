// The agency's sales automation (sales execution): which approved WhatsApp template greets a new lead and with what in its
// blanks, the follow-ups and their days, the payment reminders, and what makes a lead hot. Saved by whoever manages
// settings, each template checked to be one of the agency's approved ones with a value for every blank; audited.
import { markersOf } from "@travel-crm/contracts/inbox";
import { salesAutomation, type SalesAutomation, type SaveSalesAutomationInput } from "@travel-crm/contracts/sales";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const columns = {
  speedEnabled: true,
  speedTemplateId: true,
  speedParams: true,
  followEnabled: true,
  followSteps: true,
  reminderEnabled: true,
  reminderTemplateId: true,
  reminderParams: true,
  reminderDaysBefore: true,
  hotKeywords: true,
  hotBudgetPaise: true,
  hotTravelDays: true,
} as const;

export const defaultSalesAutomation: SalesAutomation = {
  speedEnabled: false,
  speedTemplateId: null,
  speedParams: [],
  followEnabled: false,
  followSteps: [],
  reminderEnabled: false,
  reminderTemplateId: null,
  reminderParams: [],
  reminderDaysBefore: 1,
  hotKeywords: ["price", "rate", "book", "booking", "confirm", "advance", "payment", "kitna"],
  hotBudgetPaise: null,
  hotTravelDays: 30,
};

type Row = NonNullable<Awaited<ReturnType<typeof readRow>>>;
const readRow = (tx: OrgTx) => tx.salesAutomation.findFirst({ select: columns });

const toSettings = (row: Row): SalesAutomation =>
  salesAutomation.catch(defaultSalesAutomation).parse({
    ...row,
    hotBudgetPaise: row.hotBudgetPaise === null ? null : Number(row.hotBudgetPaise),
  });

export async function salesAutomationOf(tx: OrgTx): Promise<SalesAutomation> {
  const row = await readRow(tx);
  return row === null ? defaultSalesAutomation : toSettings(row);
}

/** The template must be the agency's, approved, and every blank given something. */
async function assertTemplate(tx: OrgTx, templateId: string | null, params: readonly string[], required: boolean) {
  if (templateId === null) {
    if (required) throw new DomainError("VALIDATION", "TEMPLATE_REQUIRED", "Choose the template to send");
    return;
  }
  const template = await tx.whatsappTemplate.findUnique({
    where: { id: templateId },
    select: { status: true, body: true },
  });
  if (template?.status !== "approved") {
    throw new DomainError("CONFLICT", "TEMPLATE_NOT_APPROVED", "Only an approved template can be sent");
  }
  if (markersOf(template.body).length !== params.length) {
    throw new DomainError("VALIDATION", "TEMPLATE_VALUES", "Give a value for each blank in the template");
  }
}

export async function saveSalesAutomation(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveSalesAutomationInput,
): Promise<SalesAutomation> {
  await assertTemplate(tx, input.speedTemplateId, input.speedParams, input.speedEnabled);
  await assertTemplate(tx, input.reminderTemplateId, input.reminderParams, false);
  if (input.followEnabled && input.followSteps.length === 0) {
    throw new DomainError("VALIDATION", "FOLLOW_STEPS_REQUIRED", "Add at least one follow-up");
  }
  for (const step of input.followSteps) await assertTemplate(tx, step.templateId, step.params, true);
  const days = input.followSteps.map((step) => step.days);
  if (days.some((day, index) => index > 0 && day <= (days[index - 1] ?? 0))) {
    throw new DomainError("VALIDATION", "FOLLOW_DAYS_ORDER", "Each follow-up comes some days after the one before");
  }
  const before = await salesAutomationOf(tx);
  const data = {
    ...input,
    hotKeywords: [...new Set(input.hotKeywords)],
    hotBudgetPaise: input.hotBudgetPaise === null ? null : BigInt(input.hotBudgetPaise),
    updatedBy: access.userId,
  };
  const existing = await tx.salesAutomation.findFirst({ select: { organizationId: true } });
  const row =
    existing === null
      ? await tx.salesAutomation.create({ data, select: columns })
      : await tx.salesAutomation.update({ where: { organizationId: existing.organizationId }, data, select: columns });
  await recordAudit(tx, access, {
    action: "sales-automation.changed",
    entityType: "sales_automation",
    entityId: access.organizationId,
    before: { speed: before.speedEnabled, followUps: before.followSteps.length, reminders: before.reminderEnabled },
    after: { speed: row.speedEnabled, followUps: input.followSteps.length, reminders: row.reminderEnabled },
  });
  return toSettings(row);
}
