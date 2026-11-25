// "Show the changes": one AI credit per run, given back when the AI didn't answer or gave nothing usable; off until the agency
// turns the AI on; the model reads the trip and the agency's numbered lines (a PDF's too, photos as pictures), fenced; values
// are built by code from the cited lines; the proposal is stored as a proposed run with the trip's stamp, nothing applied.
import { MONTHLY_AI_LIMIT } from "../../../src/ai/usage.js";
import { createMemoryAiModel, type AiModel } from "@travel-crm/integrations/ai";
import { createMemoryPrompts } from "@travel-crm/integrations/prompts";
import { createMemoryTracing } from "@travel-crm/integrations/tracing";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmAiInput, requestRateSheetUpload, saveAiSettings } from "../../../src/ai/index.js";
import { proposePackageChanges } from "../../../src/ai/package-changes/propose.js";
import { tripSnapshot, tripStamp } from "../../../src/ai/package-changes/trip-snapshot.js";
import { createFiles } from "../../../src/files/index.js";
import type { MemberAccess } from "../../../src/identity/index.js";
import { openWorld, type World } from "../../bookings/support.js";
import { tinyPdf } from "../support/tiny-pdf.js";
import { aTrip, NOW, reasonOf, TODAY } from "./support.js";

const canned = JSON.stringify({
  changes: [
    {
      kind: "season_add",
      label: "Holi",
      from: "1 Mar",
      to: "10 Mar",
      // The model's own figures are never used: code reads the printed price and dates.
      startsOn: "2027-02-01",
      prices: [{ room: "double", printed: "₹7,499/-", paise: 1 }],
      lines: ["L1"],
    },
    { kind: "departures_add", dates: ["8 Jan", "15 Jan"], weekly: null, lines: ["L2"] },
    { kind: "note_add", line: "Carry ID proof", lines: ["L3"] },
  ],
  questions: [],
  ignored: ["Spiti 6N/7D prices"],
  notChanged: [],
  brochureLeftOut: false,
});
const message =
  "Holi 1 Mar to 10 Mar double 7499\nNew departures 8 Jan and 15 Jan\nCarry ID proof\nSpiti 6N/7D double 9999";

describe("proposing changes to a trip", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Propose changes");
    await world.inOrg((tx) =>
      saveAiSettings(tx, world.manager, { enabled: true, scoring: true }, { providerReady: true, now: NOW }),
    );
  });
  afterAll(() => world.close());

  const storage = createMemoryStorage();
  const files = () => createFiles({ db: world.db, storage });

  /** The memory model, counting tokens as a provider would. */
  function counted() {
    const model = createMemoryAiModel();
    const wrapped: AiModel = {
      configured: true,
      complete: async (request) => {
        const result = await model.complete(request);
        return result.ok ? { ...result, inputTokens: 1200, outputTokens: 300 } : result;
      },
    };
    return { model, wrapped };
  }

  async function setUp(
    options: {
      prompts?: ReturnType<typeof createMemoryPrompts>;
      tracing?: ReturnType<typeof createMemoryTracing>;
    } = {},
  ) {
    const trip = await aTrip(world);
    const { model, wrapped } = counted();
    const propose = (
      input: { text?: string; attachmentIds?: string[]; answers?: { questionId: string; answer: string }[] } = {},
      member: MemberAccess = world.manager,
    ) =>
      proposePackageChanges(
        { db: world.db, model: wrapped, files: files(), prompts: options.prompts, tracing: options.tracing },
        member,
        {
          packageId: trip.packageId,
          text: input.text ?? message,
          attachmentIds: input.attachmentIds ?? [],
          answers: input.answers ?? [],
        },
        NOW,
      );
    return { trip, model, propose };
  }

  const usage = () => world.inOrg((tx) => tx.aiUsage.findFirst({ select: { calls: true, inputTokens: true } }));
  const runsOf = (packageId: string) =>
    world.inOrg((tx) =>
      tx.packageChangeRun.findMany({ where: { templateId: packageId }, orderBy: { createdAt: "asc" } }),
    );

  it("proposes code-built changes from the cited lines, stores a proposed run with the trip's stamp, and records the call", async () => {
    const { trip, model, propose } = await setUp();
    const before = await usage();
    model.answer(canned);
    const proposal = await propose();

    expect(proposal.changes.map((change) => [change.id, change.kind, change.flags])).toEqual([
      ["c1", "season_add", []],
      ["c2", "departures_add", []],
      ["c3", "note_add", []],
    ]);
    expect(proposal.changes[0]).toMatchObject({
      label: "Holi",
      startsOn: "2027-03-01",
      endsOn: "2027-03-10",
      prices: { double: 749_900, triple: null },
      evidence: [{ ref: "L1", text: "Holi 1 Mar to 10 Mar double 7499", kind: "message" }],
    });
    expect(proposal.changes[1]).toMatchObject({ dates: ["2027-01-08", "2027-01-15"] });
    expect(proposal.ignored).toEqual(["Spiti 6N/7D prices"]);

    const [run] = await runsOf(trip.packageId);
    expect(run).toMatchObject({
      id: proposal.runId,
      status: "proposed",
      requestedBy: world.manager.userId,
      appliedAt: null,
    });
    expect(run?.appliedChangeIds).toEqual([]);
    const stamp = tripStamp(await world.inOrg((tx) => tripSnapshot(tx, trip.packageId, TODAY, NOW)));
    expect(run?.tripStamp).toBe(stamp);
    expect((run?.proposal as { changes: unknown[] }).changes).toEqual(proposal.changes);

    const after = await usage();
    expect((after?.calls ?? 0) - (before?.calls ?? 0)).toBe(1);
    expect(Number(after?.inputTokens ?? 0n) - Number(before?.inputTokens ?? 0n)).toBe(1200);

    const [request] = model.requests;
    expect(request).toMatchObject({ feature: "change_package", json: true });
    expect(request?.messages[0]?.content).toContain("CHANGE_PACKAGE.");
    const user = request?.messages[1]?.content ?? "";
    expect(user).toContain("Today is Wed 25 Nov 2026.");
    expect(user).toContain("S1 Regular, all other days");
    expect(user).toContain("<data>L1 Holi 1 Mar to 10 Mar double 7499\nL2 New departures 8 Jan and 15 Jan");
  });

  it("gives the credit back and refuses when the AI fails, nothing stored", async () => {
    const { trip, model, propose } = await setUp();
    const before = (await usage())?.calls ?? 0;
    model.answer({ ok: false, reason: "unavailable" });
    expect(await reasonOf(propose())).toBe("AI_UNAVAILABLE");
    model.answer({ ok: false, reason: "rate_limited" });
    expect(await reasonOf(propose())).toBe("AI_BUSY");
    expect((await usage())?.calls ?? 0).toBe(before);
    expect(await runsOf(trip.packageId)).toEqual([]);
  });

  it("gives the credit back and refuses an answer that isn't JSON, or holds nothing usable", async () => {
    const { trip, model, propose } = await setUp();
    const before = (await usage())?.calls ?? 0;
    model.answer("Sorry, I can't help with that.");
    expect(await reasonOf(propose())).toBe("AI_ANSWER_UNREADABLE");
    model.answer(JSON.stringify({ changes: [{ kind: "departure_cancel", departure: "D99", lines: ["L1"] }] }));
    expect(await reasonOf(propose())).toBe("PACKAGE_CHANGES_NOTHING");
    expect((await usage())?.calls ?? 0).toBe(before);
    expect(await runsOf(trip.packageId)).toEqual([]);
  });

  it("refuses while the AI is off, and at the month's limit, without asking the model", async () => {
    const other = await openWorld("Propose changes, AI off");
    try {
      const trip = await aTrip(other);
      const model = createMemoryAiModel();
      const propose = () =>
        proposePackageChanges(
          { db: other.db, model, files: createFiles({ db: other.db, storage }), prompts: undefined },
          other.manager,
          { packageId: trip.packageId, text: message, attachmentIds: [], answers: [] },
          NOW,
        );
      expect(await reasonOf(propose())).toBe("AI_OFF");
      await other.inOrg(async (tx) => {
        await saveAiSettings(tx, other.manager, { enabled: true, scoring: true }, { providerReady: true, now: NOW });
        await tx.aiUsage.create({ data: { month: new Date("2026-11-01T00:00:00Z"), calls: MONTHLY_AI_LIMIT } });
      });
      expect(await reasonOf(propose())).toBe("AI_MONTH_LIMIT");
      expect(model.requests).toHaveLength(0);
    } finally {
      await other.close();
    }
  });

  it("brings the AI's questions back, then sends each answer with its question apart, grounding on the answer alone", async () => {
    const { trip, model, propose } = await setUp();
    model.answer(
      JSON.stringify({
        changes: [],
        questions: [{ text: "Until 10 Mar, or until changed?", choices: ["10 Mar", "Until changed"] }],
      }),
    );
    const asked = await propose();
    expect(asked.changes).toEqual([]);
    expect(asked.questions).toEqual([
      { id: "q1", text: "Until 10 Mar, or until changed?", choices: ["10 Mar", "Until changed"] },
    ]);
    const [run] = await runsOf(trip.packageId);
    expect(run).toMatchObject({ status: "proposed", appliedAt: null });

    const holi = (answer: string) => {
      model.answer(
        JSON.stringify({
          changes: [
            {
              kind: "season_add",
              label: "Holi",
              from: "1 Mar",
              to: "10 Mar",
              prices: [{ room: "double", printed: "7,499" }],
              lines: ["L1", "A1"],
            },
          ],
        }),
      );
      return propose({ text: "Holi from 1 Mar double 7499", answers: [{ questionId: "q1", answer }] });
    };
    // "yes" prints no date: the question's "10 Mar" is never evidence.
    const yes = await holi("yes");
    const user = model.requests[1]?.messages[1]?.content ?? "";
    expect(user).toContain("by the answer that replies:\n<data>A1 Until 10 Mar, or until changed?</data>");
    expect(user).toContain("answers to your questions:\n<data>A1 yes</data>");
    expect(yes.changes[0]).toMatchObject({
      endsOn: "2027-03-10",
      flags: ["not_in_message"],
      evidence: [expect.objectContaining({ ref: "L1" }), { ref: "A1", text: "yes", kind: "answer" }],
    });
  });

  it("runs on the Langfuse prompt when there is one, and links its version to the traced call", async () => {
    const prompts = createMemoryPrompts([
      { name: "package-changes/system", version: 3, label: "production", text: "The prompt kept in Langfuse." },
    ]);
    const tracing = createMemoryTracing();
    const { model, propose } = await setUp({ prompts, tracing });
    model.answer(canned);
    await propose();
    expect(model.requests[0]?.messages[0]?.content).toBe("The prompt kept in Langfuse.");
    expect(tracing.turns[0]?.start).toMatchObject({
      name: "package-changes.propose",
      prompt: { name: "package-changes/system", version: 3 },
      metadata: { promptVersion: "langfuse:package-changes/system@3" },
    });

    // The built-in text is none of Langfuse's: no prompt is linked.
    const builtIn = await setUp({ tracing });
    builtIn.model.answer(canned);
    await builtIn.propose();
    expect(tracing.turns[1]?.start.prompt).toBeUndefined();
  });

  it("reads a PDF's lines, sends photos as pictures, and cites a photo's line as the AI read it", async () => {
    const { model, propose } = await setUp();
    const upload = async (contentType: string, body: Uint8Array, member = world.manager) => {
      const slot = await requestRateSheetUpload({ files: files() }, member, {
        contentType: contentType as "application/pdf",
        sizeBytes: body.byteLength,
      });
      await storage.upload({ ...slot.upload, expiresAt: new Date(slot.upload.expiresAt) }, body, contentType);
      await confirmAiInput({ files: files() }, member, { recordId: slot.recordId, attachmentId: slot.attachmentId });
      return slot.attachmentId;
    };
    const pdf = await upload("application/pdf", tinyPdf([["New departure 8 Jan"]]));
    model.answer(canned);
    await propose({ text: "", attachmentIds: [pdf] });
    expect(model.requests[0]?.messages[1]?.content).toContain("<data>P1.L1 New departure 8 Jan</data>");

    const photo = await upload("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]));
    model.answer(
      JSON.stringify({
        changes: [{ kind: "departures_add", dates: ["8 Jan"], weekly: null, lines: ["P1.L2"] }],
        photoLines: [{ ref: "P1.L2", text: "8 Jan new batch" }],
      }),
    );
    const proposal = await propose({ text: "", attachmentIds: [photo] });
    expect(model.requests[1]?.messages[1]?.attachments).toHaveLength(1);
    expect(proposal.changes[0]).toMatchObject({
      evidence: [{ ref: "P1.L2", text: "8 Jan new batch", kind: "photo" }],
      flags: [],
    });

    // Another member's upload, or a PDF beside a photo, is refused.
    expect(await reasonOf(propose({ attachmentIds: [photo] }, { ...world.manager, userId: world.seller.userId }))).toBe(
      "NOT_FOUND",
    );
    expect(await reasonOf(propose({ attachmentIds: [pdf, photo] }))).toBe("PACKAGE_CHANGES_FILES");
  });

  it("refuses an empty request without using a credit", async () => {
    const { model, propose } = await setUp();
    expect(await reasonOf(propose({ text: "  " }))).toBe("PACKAGE_CHANGES_EMPTY");
    expect(model.requests).toHaveLength(0);
  });
});
