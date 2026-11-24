// The console runs each of an agency's WhatsApp numbers within its plan (spec section 10): a number is recorded only while
// the plan's live numbers leave room, also when two records race for the last place; the first is the main one; every
// action works on the one number it names, another agency's being "not found"; the main mark moves, and falls back to the
// oldest live number once the main one is disconnected.
import { randomUUID } from "node:crypto";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createMemoryWhatsAppProvider } from "@travel-crm/integrations/whatsapp";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  changePlan,
  checkWhatsAppWithProvider,
  connectWhatsApp,
  createPlan,
  disconnectWhatsApp,
  getOrganizationWhatsApp,
  markWhatsAppConnected,
  onboardOrganization,
  pauseWhatsApp,
  renameWhatsApp,
  resumeWhatsApp,
  setWhatsAppCaps,
  setWhatsAppMain,
  type PlatformServices,
} from "../../src/platform/index.js";
import { createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

const superAdmin = { userId: randomUUID() };

let nextNumber = Math.floor(Math.random() * 9e6);
/** A number MSG91 would call ours, unique to the run. */
const aBusinessNumber = () => `9177${String((nextNumber += 1)).padStart(8, "0")}`;

describe("the console's WhatsApp numbers", () => {
  let test: TestPlatform;
  let platform: PlatformClient;
  let services: PlatformServices;
  const provider = createMemoryWhatsAppProvider();

  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
    services = {
      ...test.services,
      whatsapp: { provider, webhookUrl: "https://example.test/hook", webhookHeaderName: "x", webhookHeaderValue: "y" },
    };
  });
  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  /** A plan with the inbox and room for `numbers` WhatsApp numbers. */
  const aPlan = (numbers: number): Promise<PlanSummary> =>
    createPlan(test.services, support, {
      key: `plan-${randomUUID().slice(0, 8)}`,
      name: numbers === 1 ? "Starter" : "Growth",
      monthlyPricePaise: 250_000,
      yearlyPricePaise: null,
      seatLimit: 5,
      whatsappNumberLimit: numbers,
      storageLimitBytes: 5_000_000_000,
      modules: ["crm", "inbox"],
    });

  /** A new agency on a month's trial of the plan. */
  const anAgency = async (plan: PlanSummary) =>
    (await onboardOrganization(test.services, support, onboardingInput(plan))).organizationId;

  const record = (organizationId: string, label: string, integratedNumber = aBusinessNumber()) => {
    provider.addNumber(integratedNumber);
    return connectWhatsApp(services, superAdmin, {
      organizationId,
      displayNumber: `+${integratedNumber}`,
      integratedNumber,
      mode: "new_number",
      label,
    });
  };

  const group = (organizationId: string) => getOrganizationWhatsApp(services, organizationId, new Date());

  /** The id of the agency's live number with this label. */
  const idOf = async (organizationId: string, label: string): Promise<string> => {
    const found = (await group(organizationId)).numbers.find((number) => number.label === label);
    if (found === undefined) throw new Error(`no live number labelled ${label}`);
    return found.id;
  };

  /** MSG91's first event for the number arrived, so it may be marked connected. */
  const seen = (connectionId: string) =>
    platform.whatsappConnection.update({ where: { id: connectionId }, data: { lastEventAt: new Date() } });

  const statusOf = async (connectionId: string) =>
    (await platform.whatsappConnection.findUniqueOrThrow({ where: { id: connectionId } })).status;

  /** Records a number and marks it connected; returns its id. */
  const connected = async (organizationId: string, label: string): Promise<string> => {
    await record(organizationId, label);
    const connectionId = await idOf(organizationId, label);
    await seen(connectionId);
    await markWhatsAppConnected(services, superAdmin, { organizationId, connectionId });
    return connectionId;
  };

  it("records a second number on a two-number plan, and refuses a third", async () => {
    const organizationId = await anAgency(await aPlan(2));
    expect(await group(organizationId)).toMatchObject({ numbers: [], limit: { used: 0, allowed: 2 } });
    await record(organizationId, "Sales 1");
    expect(await group(organizationId)).toMatchObject({ limit: { used: 1, allowed: 2 }, cannotAddReason: null });
    await record(organizationId, "Sales 2");
    await expect(record(organizationId, "Sales 3")).rejects.toMatchObject({ reason: "WHATSAPP_NUMBER_LIMIT" });
    const after = await group(organizationId);
    expect(after.numbers.map((number) => number.label)).toEqual(["Sales 1", "Sales 2"]);
    expect(after).toMatchObject({ limit: { used: 2, allowed: 2 }, cannotAddReason: "LIMIT_REACHED" });
  });

  it("refuses the last place to one of two records made at once", async () => {
    const organizationId = await anAgency(await aPlan(2));
    await record(organizationId, "Sales 1");
    const results = await Promise.allSettled([record(organizationId, "Sales 2"), record(organizationId, "Sales 3")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { reason: "WHATSAPP_NUMBER_LIMIT" },
    });
    expect((await group(organizationId)).numbers).toHaveLength(2);
  });

  it("makes the first number recorded the main one, and keeps it main when a second comes", async () => {
    const organizationId = await anAgency(await aPlan(2));
    await record(organizationId, "Sales 1");
    const first = await idOf(organizationId, "Sales 1");
    expect((await platform.whatsappConnection.findUniqueOrThrow({ where: { id: first } })).isMain).toBe(true);
    await record(organizationId, "Sales 2");
    const second = await idOf(organizationId, "Sales 2");
    expect((await platform.whatsappConnection.findUniqueOrThrow({ where: { id: second } })).isMain).toBe(false);
    expect((await group(organizationId)).numbers).toMatchObject([
      { id: first, label: "Sales 1", main: true, status: "setup" },
      { id: second, label: "Sales 2", main: false, status: "setup" },
    ]);
  });

  it("counts a trial's numbers against its plan, and refuses Mark connected past it after a downgrade", async () => {
    const growth = await aPlan(2);
    const starter = await aPlan(1);
    const organizationId = await anAgency(growth);
    await connected(organizationId, "Sales 1");
    await record(organizationId, "Sales 2");
    const second = await idOf(organizationId, "Sales 2");
    await seen(second);
    await changePlan(test.services, support, { organizationId, planId: starter.id, billingCycle: "monthly" });

    await expect(
      markWhatsAppConnected(services, superAdmin, { organizationId, connectionId: second }),
    ).rejects.toMatchObject({ reason: "WHATSAPP_NUMBER_LIMIT" });
    expect(await statusOf(second)).toBe("setup");
    await expect(record(organizationId, "Sales 3")).rejects.toMatchObject({ reason: "WHATSAPP_NUMBER_LIMIT" });
    const after = await group(organizationId);
    expect(after).toMatchObject({ limit: { used: 2, allowed: 1 }, cannotAddReason: "LIMIT_REACHED" });
    expect(after.numbers.find((number) => number.id === second)?.cannotConnectReason).toBe("NO_NUMBER_LIMIT");
  });

  it("pauses, resumes, disconnects and checks one number, leaving the other as it was", async () => {
    const organizationId = await anAgency(await aPlan(2));
    const first = await connected(organizationId, "Sales 1");
    const second = await connected(organizationId, "Sales 2");
    const input = { organizationId, connectionId: second };

    await pauseWhatsApp(services, superAdmin, input);
    expect([await statusOf(first), await statusOf(second)]).toEqual(["connected", "paused"]);
    await resumeWhatsApp(services, superAdmin, input);
    expect([await statusOf(first), await statusOf(second)]).toEqual(["connected", "connected"]);

    const secondNumber = (await platform.whatsappConnection.findUniqueOrThrow({ where: { id: second } }))
      .integratedNumber;
    provider.addNumber(secondNumber, { qualityRating: "yellow" });
    expect(await checkWhatsAppWithProvider(services, input)).toEqual({ answered: true });
    const ratings = await platform.whatsappConnection.findMany({
      where: { id: { in: [first, second] } },
      select: { id: true, qualityRating: true },
    });
    expect(ratings).toEqual(
      expect.arrayContaining([
        { id: first, qualityRating: null },
        { id: second, qualityRating: "yellow" },
      ]),
    );

    await disconnectWhatsApp(services, superAdmin, input);
    expect([await statusOf(first), await statusOf(second)]).toEqual(["connected", "disconnected"]);
    expect((await group(organizationId)).numbers.map((number) => number.id)).toEqual([first]);
    const entries = await platform.auditEntry.findMany({
      where: { organizationId, entityId: second, action: { in: ["whatsapp.paused", "whatsapp.disconnected"] } },
    });
    expect(entries).toHaveLength(2);
  });

  it("moves the main mark, and shows the oldest live number as main once the main is disconnected", async () => {
    const organizationId = await anAgency(await aPlan(3));
    const first = await connected(organizationId, "Sales 1");
    const second = await connected(organizationId, "Sales 2");
    const third = await connected(organizationId, "Sales 3");

    // Two Make mains at once take turns under the subscription's lock: both land, one after the other.
    await Promise.all([
      setWhatsAppMain(services, superAdmin, { organizationId, connectionId: second }),
      setWhatsAppMain(services, superAdmin, { organizationId, connectionId: third }),
    ]);
    const flagged = await platform.whatsappConnection.findMany({ where: { organizationId, isMain: true } });
    expect(flagged).toHaveLength(1);

    await setWhatsAppMain(services, superAdmin, { organizationId, connectionId: third });
    expect((await group(organizationId)).numbers.map(({ id, main }) => ({ id, main }))).toEqual([
      { id: third, main: true },
      { id: first, main: false },
      { id: second, main: false },
    ]);
    expect(
      await platform.auditEntry.findMany({ where: { organizationId, action: "whatsapp.made-main", entityId: third } }),
    ).toContainEqual(expect.objectContaining({ source: "platform", actorUserId: superAdmin.userId }));

    await disconnectWhatsApp(services, superAdmin, { organizationId, connectionId: third });
    expect((await group(organizationId)).numbers.map(({ id, main }) => ({ id, main }))).toEqual([
      { id: first, main: true },
      { id: second, main: false },
    ]);
    await setWhatsAppMain(services, superAdmin, { organizationId, connectionId: second });
    expect((await group(organizationId)).numbers[0]).toMatchObject({ id: second, main: true });
  });

  it("renames a number", async () => {
    const organizationId = await anAgency(await aPlan(2));
    await record(organizationId, "Sales 1");
    const connectionId = await idOf(organizationId, "Sales 1");
    await renameWhatsApp(services, superAdmin, { organizationId, connectionId, label: "Sales 2" });
    expect((await group(organizationId)).numbers).toMatchObject([{ id: connectionId, label: "Sales 2" }]);
    expect(await platform.auditEntry.findMany({ where: { organizationId, action: "whatsapp.renamed" } })).toMatchObject(
      [{ entityId: connectionId, before: { numberLabel: "Sales 1" }, after: { numberLabel: "Sales 2" } }],
    );
  });

  it("refuses another agency's number as not found, and a number the agency already has live", async () => {
    const plan = await aPlan(2);
    const organizationId = await anAgency(plan);
    const other = await anAgency(plan);
    const integratedNumber = aBusinessNumber();
    await record(organizationId, "Sales 1", integratedNumber);
    await record(other, "Sales 1");
    const theirs = await idOf(other, "Sales 1");
    const input = { organizationId, connectionId: theirs };

    for (const action of [
      () => markWhatsAppConnected(services, superAdmin, input),
      () => pauseWhatsApp(services, superAdmin, input),
      () => resumeWhatsApp(services, superAdmin, input),
      () => disconnectWhatsApp(services, superAdmin, input),
      () => setWhatsAppMain(services, superAdmin, input),
      () => renameWhatsApp(services, superAdmin, { ...input, label: "Mine" }),
      () => checkWhatsAppWithProvider(services, input),
      () => setWhatsAppCaps(services, superAdmin, { ...input, marketingCapMonth: 10, templateCapDay: 10 }),
    ]) {
      await expect(action()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await statusOf(theirs)).toBe("setup");
    await expect(record(organizationId, "Sales 2", integratedNumber)).rejects.toMatchObject({
      reason: "WHATSAPP_NUMBER_RECORDED",
    });
    expect((await group(organizationId)).numbers).toHaveLength(1);
  });
});
