// "Show the changes" (the AI change assistant): one structured AI call reads what the agency gave against the trip as it
// is, and proposes changes that code grounds in the cited lines. Short transactions around the model, as the rate reader
// has: the checks and the trip's snapshot, one monthly credit, the model, then the run row (or the credit given back when
// the AI didn't answer or gave nothing usable). It proposes and never changes the trip: Apply does, from the stored run.
import {
  storedPackageChangeProposal,
  type PackageChangeProposal,
  type ProposePackageChangesInput,
} from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { Files } from "../../files/index.js";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import { jsonObjectIn } from "../fill/json.js";
import { modelRefusal, refuse } from "../refusals.js";
import { aiEnabled } from "../settings.js";
import { recordTokens, releaseAiCall, reserveAiCall } from "../usage.js";
import { parseChangesAnswer } from "./answer.js";
import { changeRights, groundChanges } from "./ground.js";
import { answerLines, checkedInputs, loadInputs, messageLines } from "./inputs.js";
import { jsonOf } from "./json.js";
import { changesMessages, packageChangesPromptOf } from "./prompt.js";
import { tripSnapshot, tripStamp } from "./trip-snapshot.js";

export interface ProposeDependencies {
  db: Database;
  model: AiModel;
  files: Files;
  prompts: AiPrompts | undefined;
}

/** The questions the member's last run for this trip asked, by id, so an answer reaches the model with its question. */
async function askedBefore(tx: OrgTx, access: MemberAccess, packageId: string): Promise<Map<string, string>> {
  const run = await tx.packageChangeRun.findFirst({
    where: { templateId: packageId, requestedBy: access.userId, status: "proposed" },
    orderBy: { createdAt: "desc" },
    select: { proposal: true },
  });
  const stored = storedPackageChangeProposal.safeParse(run?.proposal);
  return new Map(stored.success ? stored.data.questions.map((question) => [question.id, question.text]) : []);
}

const cleaned = (texts: readonly string[]) => texts.map((text) => text.trim()).filter((text) => text !== "");

export async function proposePackageChanges(
  { db, model, files, prompts }: ProposeDependencies,
  access: MemberAccess,
  input: ProposePackageChangesInput,
  now: Date,
  /** Whether the plan has departures: without it, departure changes are flagged not allowed. */
  options: { departuresOnPlan: boolean } = { departuresOnPlan: true },
): Promise<PackageChangeProposal> {
  const { organizationId } = access;
  if (!model.configured) throw refuse("AI_NOT_READY", "The AI isn't set up on this server yet");
  const message = messageLines(input.text);
  if (message.length === 0 && input.attachmentIds.length === 0) {
    throw refuse("PACKAGE_CHANGES_EMPTY", "Paste what changed, or attach photos or a PDF", "VALIDATION");
  }
  const checked = await db.forOrg(organizationId, async (tx) => {
    if (!(await aiEnabled(tx))) {
      throw refuse("AI_OFF", "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI");
    }
    const timeZone = await organizationTimeZone(tx, organizationId);
    const today = calendarDateIn(now, timeZone);
    return {
      timeZone,
      today,
      snapshot: await tripSnapshot(tx, input.packageId, today, now),
      stored: await checkedInputs(tx, access, input.attachmentIds),
      questions: await askedBefore(tx, access, input.packageId),
    };
  });
  const { timeZone, today, snapshot } = checked;
  const loaded = await loadInputs(files, organizationId, checked.stored);
  const answers = answerLines(input.answers, checked.questions);
  const messages = changesMessages({
    prompt: await packageChangesPromptOf(prompts),
    today,
    tripText: snapshot.text,
    message,
    pdf: loaded.pdfLines,
    answers,
    photos: loaded.photos,
  });

  // One monthly credit, taken before the model is asked and given back when it doesn't answer usefully.
  const reserved = await db.forOrg(organizationId, (tx) => reserveAiCall(tx, now, timeZone));
  if (!reserved) throw refuse("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  const giveBack = () => db.forOrg(organizationId, (tx) => releaseAiCall(tx, now, timeZone));
  let result;
  try {
    // Opaque: the agency's id, never a person's.
    result = await model.complete({
      feature: "change_package",
      messages,
      json: true,
      maxTokens: 6000,
      user: organizationId,
    });
  } catch (error) {
    await giveBack();
    throw error;
  }
  if (!result.ok) {
    await giveBack();
    throw modelRefusal(result.reason);
  }
  const answer = parseChangesAnswer(jsonObjectIn(result.text));
  if (answer === null) {
    await giveBack();
    throw refuse("AI_ANSWER_UNREADABLE", "The AI's answer couldn't be read");
  }
  const proposal = {
    changes: groundChanges(answer, {
      snapshot,
      lines: new Map([...message, ...loaded.pdfLines, ...answers]),
      photoCount: loaded.photos.length,
      today,
      rights: changeRights(access, options.departuresOnPlan),
    }),
    questions: answer.questions
      .filter((question) => question.text.trim() !== "")
      .map((question, index) => ({
        id: `q${String(index + 1)}`,
        text: question.text.trim(),
        choices: cleaned(question.choices),
      })),
    ignored: cleaned(answer.ignored),
    notChanged: cleaned(answer.notChanged),
    brochureLeftOut: answer.brochureLeftOut && loaded.pdfLines.length > 0,
  };
  const { changes, questions, ignored, notChanged } = proposal;
  if (changes.length + questions.length + ignored.length + notChanged.length === 0) {
    await giveBack();
    throw refuse("PACKAGE_CHANGES_NOTHING", "The AI found no changes for this trip", "VALIDATION");
  }
  const run = await db.forOrg(organizationId, async (tx) => {
    await recordTokens(tx, now, timeZone, { input: result.inputTokens, output: result.outputTokens });
    return tx.packageChangeRun.create({
      data: {
        templateId: snapshot.trip.id,
        requestedBy: access.userId,
        proposal: jsonOf({ from: today, ...proposal }),
        tripStamp: tripStamp(snapshot),
      },
      select: { id: true },
    });
  });
  return { runId: run.id, ...proposal };
}
