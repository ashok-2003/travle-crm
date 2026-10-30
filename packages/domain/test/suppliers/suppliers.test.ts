// Suppliers (release 7a): a supplier with contacts, linked to costs by hand, the bank details only for whoever edits
// suppliers, what the agency owes grouped by supplier with the overdue first, a supplier deleted only when nothing is owed
// to it, and the daily reminder of a payment falling due, once for each cost.
import { randomUUID } from "node:crypto";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addTripCost, markTripCostPaid } from "../../src/finance/index.js";
import {
  createSupplier,
  deleteSupplier,
  getSupplier,
  linkSimilarCosts,
  listSuppliers,
  removeSupplierContact,
  runSupplierDueSoon,
  saveSupplierContact,
  supplierDues,
  updateSupplier,
} from "../../src/suppliers/index.js";
import { aBooking, openWorld, type World } from "../bookings/support.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const now = new Date("2026-10-29T06:30:00Z");
const hotel = {
  kind: "hotel" as const,
  name: "Hotel Snow",
  city: "Manali",
  gstin: "",
  paymentTerms: "50% advance",
  paymentDetails: "UPI snow@okbank",
  notes: "",
};

describe("suppliers and what the agency owes", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Suppliers");
  });
  afterAll(async () => {
    await world.close();
  });

  const cost = (
    quoteId: string,
    supplier: string,
    amountPaise: number,
    dueOn: string | null,
    supplierId: string | null = null,
  ) => ({
    quoteId,
    departureId: null,
    supplierId,
    category: "hotel" as const,
    supplier,
    amountPaise,
    dueOn,
    paidOn: null,
    note: "",
  });

  it("keeps a supplier with its contacts and refuses a second with the same name in any case", async () => {
    const created = await world.inOrg((tx) => createSupplier(tx, world.manager, hotel));
    await expect(
      world.inOrg((tx) => createSupplier(tx, world.manager, { ...hotel, name: "hotel snow" })),
    ).rejects.toMatchObject({
      reason: "SUPPLIER_NAME_TAKEN",
    });
    await world.inOrg((tx) =>
      saveSupplierContact(tx, world.manager, {
        supplierId: created.id,
        name: "Dorje",
        role: "Manager",
        phone: "+919800000001",
        whatsapp: "",
        email: "",
      }),
    );
    await world.inOrg((tx) =>
      updateSupplier(tx, world.manager, { ...hotel, supplierId: created.id, city: "Old Manali" }),
    );
    const detail = await world.inOrg((tx) => getSupplier(tx, world.manager, created.id));
    expect(detail).toMatchObject({ city: "Old Manali", contacts: [{ name: "Dorje", phone: "+919800000001" }] });
    const list = await world.inOrg((tx) => listSuppliers(tx, { search: "snow" }));
    expect(list.items).toMatchObject([{ name: "Hotel Snow", contactName: "Dorje", contactPhone: "+919800000001" }]);
    expect((await world.inOrg((tx) => listSuppliers(tx, { kind: "guide" }))).items).toEqual([]);
    const contact = detail.contacts[0];
    await world.inOrg((tx) => removeSupplierContact(tx, world.manager, contact?.id ?? ""));
    expect((await world.inOrg((tx) => getSupplier(tx, world.manager, created.id))).contacts).toEqual([]);
  });

  it("shows bank details only to whoever edits suppliers, and costs only to whoever sees the accounts", async () => {
    const created = await world.inOrg((tx) => createSupplier(tx, world.manager, { ...hotel, name: "Hotel Peak" }));
    const sales = memberWithStarterRole("sales", { organizationId: world.organizationId, userId: randomUUID() });
    const asSales = await world.inOrg((tx) => getSupplier(tx, sales, created.id));
    expect(asSales).toMatchObject({ paymentDetails: "", costs: null, linkableCosts: null, owedPaise: null });
    const asManager = await world.inOrg((tx) => getSupplier(tx, world.manager, created.id));
    expect(asManager).toMatchObject({ paymentDetails: "UPI snow@okbank", costs: [], owedPaise: 0 });
  });

  it("links costs named like the supplier on request, and groups dues with the overdue first", async () => {
    const supplier = await world.inOrg((tx) => createSupplier(tx, world.manager, { ...hotel, name: "Dolma Lodge" }));
    const first = await aBooking(world, { confirmed: true });
    const second = await aBooking(world, { confirmed: true });
    await world.inOrg(async (tx) => {
      await addTripCost(tx, world.accounts, cost(first.quoteId, "dolma lodge", 30_000_00, "2026-10-20"));
      await addTripCost(tx, world.accounts, cost(second.quoteId, "Dolma Lodge", 20_000_00, "2026-11-20"));
      await addTripCost(tx, world.accounts, cost(second.quoteId, "Cabs of Spiti", 10_000_00, "2026-11-01"));
    });
    const before = await world.inOrg((tx) => getSupplier(tx, world.accounts, supplier.id));
    expect(before).toMatchObject({ linkableCosts: 2, owedPaise: 0, costs: [] });
    expect(await world.inOrg((tx) => linkSimilarCosts(tx, world.accounts, supplier.id))).toBe(2);
    expect(await world.inOrg((tx) => linkSimilarCosts(tx, world.accounts, supplier.id))).toBe(0);
    const after = await world.inOrg((tx) => getSupplier(tx, world.accounts, supplier.id));
    expect(after).toMatchObject({ owedPaise: 50_000_00, linkableCosts: 0 });
    expect(after.costs).toHaveLength(2);
    const dues = await world.inOrg((tx) => supplierDues(tx, parseCalendarDate("2026-10-29")));
    const lodge = dues.groups.find((group) => group.supplierId === supplier.id);
    expect(lodge).toMatchObject({ name: "Dolma Lodge", owedPaise: 50_000_00, overduePaise: 30_000_00 });
    expect(lodge?.items.map((item) => item.overdue)).toEqual([true, false]);
    const cabs = dues.groups.find((group) => group.name === "Cabs of Spiti");
    expect(cabs).toMatchObject({ supplierId: null, owedPaise: 10_000_00, overduePaise: 0 });
    expect(dues.groups[0]?.supplierId).toBe(supplier.id);
    expect(dues.totalPaise).toBeGreaterThanOrEqual(60_000_00);
  });

  it("refuses to delete a supplier that is still owed, and deletes it once everything is paid", async () => {
    const supplier = await world.inOrg((tx) => createSupplier(tx, world.manager, { ...hotel, name: "Owed Hotel" }));
    const booking = await aBooking(world, { confirmed: true });
    await world.inOrg((tx) =>
      addTripCost(tx, world.accounts, cost(booking.quoteId, "Owed Hotel", 5_000_00, null, supplier.id)),
    );
    await expect(world.inOrg((tx) => deleteSupplier(tx, world.manager, supplier.id))).rejects.toMatchObject({
      reason: "SUPPLIER_HAS_UNPAID",
    });
    const owed = await world.inOrg((tx) => tx.tripCost.findFirstOrThrow({ where: { supplierId: supplier.id } }));
    await world.inOrg((tx) => markTripCostPaid(tx, world.accounts, { tripCostId: owed.id, paidOn: "2026-10-29" }));
    await world.inOrg((tx) => deleteSupplier(tx, world.manager, supplier.id));
    await expect(world.inOrg((tx) => getSupplier(tx, world.manager, supplier.id))).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
    // The name is free again.
    await world.inOrg((tx) => createSupplier(tx, world.manager, { ...hotel, name: "Owed Hotel" }));
  });

  it("tells whoever keeps the accounts of a payment due within two days, once for each cost", async () => {
    const keeper = world.accounts.userId;
    const booking = await aBooking(world, { confirmed: true });
    await world.inOrg((tx) =>
      addTripCost(tx, world.accounts, cost(booking.quoteId, "Reminder Lodge", 7_500_00, "2026-10-31")),
    );
    const dependencies = {
      db: world.db,
      logger: { error: () => undefined } as never,
      identity: {
        organizationsPage: () => Promise.resolve([{ id: world.organizationId, timeZone: "Asia/Kolkata" }]),
        membersHolding: () => Promise.resolve([keeper]),
      } as never,
      subscriptions: { entitlementsOf: () => Promise.resolve({ access: "full" }) } as never,
    };
    expect(await runSupplierDueSoon(dependencies, now)).toBeGreaterThan(0);
    const told = await world.inOrg((tx) =>
      tx.notification.findMany({
        where: { kind: "supplier-cost.due-soon", recipientUserId: keeper, title: "Payment due: Reminder Lodge" },
      }),
    );
    expect(told).toHaveLength(1);
    expect(told[0]?.body).toContain("7,500.00");
    await runSupplierDueSoon(dependencies, new Date("2026-10-30T06:30:00Z"));
    const again = await world.inOrg((tx) =>
      tx.notification.count({ where: { kind: "supplier-cost.due-soon", title: "Payment due: Reminder Lodge" } }),
    );
    expect(again).toBe(1);
  });
});
