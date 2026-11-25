// "Show the changes" (the AI change assistant): one structured AI call reads what the agency gave against the trip as it
// is, and proposes changes that code grounds in the cited lines. Short transactions around the model, as the rate reader
// has: the checks and the trip's snapshot, one monthly credit, the model, then the run row (or the credit given back when
// the AI didn't answer or gave nothing usable). It proposes and never changes the trip: Apply does, from the stored run.
import type { PackageChangeProposal, ProposePackageChangesInput } from "@travel-crm/contracts/ai";
import type { Database } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { AiTracing } from "@travel-crm/integrations/tracing";
import type { Files } from "../../files/index.js";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import { jsonObjectIn } from "../fill/json.js";
import { modelRefusal, refuse } from "../refusals.js";
import { aiEnabled } from "../settings.js";
import { recordTokens, releaseAiCall, reserveAiCall } from "../usage.js";
import { parseChangesAnswer } from "./answer.js";
import { changeRights, groundChanges } from "./ground.js";
import { answerLines, askedLines, checkedInputs, loadInputs, messageLines } from "./inputs.js";
import { askForChanges, changesMessages, packageChangesPromptOf } from "./prompt.js";
import { jsonOf, questionsAsked } from "./runs.js";
import { tripSnapshot, tripStamp } from "./trip-snapshot.js";

export interface ProposeDependencies {
  db: Database;
  model: AiModel;
  files: Files;
  prompts: AiPrompts | undefined;
  /** Where the call is traced (Langfuse); absent, nowhere. */
  tracing?: AiTracing | undefined;
}

const cleaned = (texts: readonly string[]) => texts.map((text) => text.trim()).filter((text) => text !== "");

export async function proposePackageChanges(
  { db, model, files, prompts, tracing }: ProposeDependencies,
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
      questions: await questionsAsked(tx, access, input.packageId),
    };
  });
  const { timeZone, today, snapshot } = checked;
  const loaded = await loadInputs(files, organizationId, checked.stored);
  // An answer is what a change may cite; the question it replies to goes to the model apart, never as evidence.
  const answers = answerLines(input.answers);
  const prompt = await packageChangesPromptOf(prompts);
  const messages = changesMessages({
    prompt,
    today,
    tripText: snapshot.text,
    message,
    pdf: loaded.pdfLines,
    answers,
    asked: askedLines(input.answers, checked.questions),
    photos: loaded.photos,
  });

  // One monthly credit, taken before the model is asked and given back when it doesn't answer usefully.
  const reserved = await db.forOrg(organizationId, (tx) => reserveAiCall(tx, now, timeZone));
  if (!reserved) throw refuse("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  const giveBack = () => db.forOrg(organizationId, (tx) => releaseAiCall(tx, now, timeZone));
  let result;
  try {
    result = await askForChanges(model, tracing, prompt, messages, {
      organizationId,
      userId: access.userId,
      packageId: snapshot.trip.id,
      photos: loaded.photos.length,
      pdfLines: loaded.pdfLines.length,
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
