// Who a password-reset request emails, and how alike the answers are: staff without email and addresses nobody has
// get nothing, one address gets at most 3 emails an hour, a link may lead back only to the reset page, and no answer
// (status, headers or body) says which case it was.
import { describe, expect, it } from "vitest";
import { answerOf, expectBetterAuthLogs, resetPage, useResetKit } from "./support/password-reset.js";
import { ownerAccess } from "./support/people.js";
import { ORIGIN } from "./support/test-server.js";

const HOUR_MS = 60 * 60 * 1000;

describe("who a password reset emails, and the answers", () => {
  const kit = useResetKit();

  it("answers a placeholder or unknown address exactly like a real one, and sends them nothing", async () => {
    const { server, agency, emails } = kit;
    const checkWarnings = expectBetterAuthLogs("warn", "User not found", 1);
    // Staff without email have a placeholder address, which Better Auth finds like any other.
    await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Meera",
      username: "meera",
      roleKey: "operations",
      temporaryPassword: "temporary-password-2",
    });
    const real = `kiran-${agency.code.toLowerCase()}@example.test`;
    await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Kiran",
      email: real,
      roleKey: "sales",
      temporaryPassword: "temporary-password-3",
    });
    const askedBefore = emails.asked();
    const answers = [];
    for (const email of [real, `${agency.code.toLowerCase()}-meera@no-email.invalid`, "nobody@example.test"]) {
      answers.push(await answerOf(await kit.ask(email)));
    }
    expect(answers[0]?.status).toBe(200);
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
    await emails.settled();
    // Only the real address was handed to the sender, and it got its email.
    expect(emails.asked()).toBe(askedBefore + 1);
    expect((await kit.messagesTo(real)).map((message) => message.To)).toEqual([[{ Address: real, Name: "Kiran" }]]);
    checkWarnings();
  });

  it("sends one address at most 3 reset emails an hour, from wherever they are asked for", async () => {
    const { server, agency, emails } = kit;
    const address = `tara-${agency.code.toLowerCase()}@example.test`;
    await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Tara",
      email: address,
      roleKey: "sales",
      temporaryPassword: "temporary-password-5",
    });
    const answers = [];
    for (const clientAddress of ["203.0.113.71", "203.0.113.72", "203.0.113.73", "203.0.113.74"]) {
      answers.push(await answerOf(await kit.ask(address, resetPage, clientAddress)));
      await emails.settled();
    }
    expect(answers[0]?.status).toBe(200);
    for (const answer of answers) expect(answer).toEqual(answers[0]);
    // All four were counted in one window of the cap (its clock is pinned), so the fourth was the one over it.
    const hits = kit.capHits.filter((hit) => hit.key === `password-reset-recipient:${address}`);
    expect(hits).toHaveLength(4);
    expect(new Set(hits.map((hit) => Math.floor(hit.at.getTime() / HOUR_MS))).size).toBe(1);
    expect(await kit.messagesTo(address)).toHaveLength(3);
  });

  it("sends people back only to the reset page, refusing anything else alike for every address", async () => {
    const { agency, emails } = kit;
    const checkWarnings = expectBetterAuthLogs("warn", "User not found", 0);
    const checkErrors = expectBetterAuthLogs("error", "Invalid redirectURL", 2);
    const askedBefore = emails.asked();
    // An untrusted origin is refused by Better Auth itself, and that refusal is the one every other case matches.
    const untrusted = [];
    for (const email of [agency.owner.email, "nobody@example.test"]) {
      untrusted.push(await answerOf(await kit.ask(email, "https://phishing.example/reset-password")));
    }
    expect(untrusted[0]?.status).toBe(403);
    expect(untrusted[1]).toEqual(untrusted[0]);
    // A trusted origin's other page, or no page at all, is refused the same way, before any address is looked up.
    for (const redirectTo of [`${ORIGIN}/sign-in`, `${resetPage}?next=x`, null]) {
      for (const email of [agency.owner.email, "nobody@example.test"]) {
        expect(await answerOf(await kit.ask(email, redirectTo))).toEqual(untrusted[0]);
      }
    }
    await emails.settled();
    expect(emails.asked()).toBe(askedBefore);
    checkWarnings();
    checkErrors();
  });
});
