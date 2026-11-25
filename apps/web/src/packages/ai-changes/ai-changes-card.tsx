"use client";

// "Tell the AI what changed" at the top of a trip's page: the agency pastes a message, photos or a PDF and sees a table of
// exact changes (the AI proposes, nothing is saved), applies the ticked ones in one go and can Undo all. Shown only to
// whoever holds quotes:edit with the AI on the plan.
import type { UndoPackageChangesResult } from "@travel-crm/contracts/ai";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { usePackage } from "../use-packages";
import { RefusalAlert } from "@/components/refusal-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cardTints } from "@/components/card-tints";
import { AppliedView, UndoneView } from "./applied-view";
import { ChangeInput, filesAreAllowed, inputTypeOf } from "./change-input";
import { cleanChangeIds } from "./change-table";
import { ProposalView } from "./proposal-view";
import { answerOf, QuestionsForm, type QuestionAnswer } from "./questions-form";
import {
  useApplyChanges,
  useLatestChangeRun,
  usePackageChangesAvailable,
  type ProposedChange,
  type ProposedChanges,
  useProposeChanges,
  useUploadChangeInput,
} from "./use-package-changes-ai";

interface Applied {
  runId: string;
  count: number;
  changes: ProposedChange[] | null;
}

export function AiChangesCard({ packageId }: { packageId: string }) {
  const available = usePackageChangesAvailable();
  return available ? <Box packageId={packageId} /> : null;
}

function Box({ packageId }: { packageId: string }) {
  const t = useTranslations("packages.aiChanges");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({});
  const [proposal, setProposal] = useState<ProposedChanges | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [undone, setUndone] = useState<UndoPackageChangesResult | null>(null);
  const [hideLatest, setHideLatest] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const uploaded = useRef(new Map<File, string>());
  const seasons = usePackage(packageId).data?.seasons;
  const propose = useProposeChanges();
  const upload = useUploadChangeInput();
  const latest = useLatestChangeRun(packageId, true);
  const chosen = useRef<ProposedChange[]>([]);
  const apply = useApplyChanges((count) => {
    if (proposal) setApplied({ runId: proposal.runId, count, changes: chosen.current });
    setProposal(null);
  });

  const show = async (withAnswers: boolean) => {
    setWorking(true);
    setError(null);
    try {
      const attachmentIds: string[] = [];
      for (const file of files) {
        const type = inputTypeOf(file);
        if (type === null) continue;
        const id = uploaded.current.get(file) ?? (await upload(file, type));
        uploaded.current.set(file, id);
        attachmentIds.push(id);
      }
      const given = withAnswers
        ? (proposal?.questions ?? []).flatMap((question) => {
            const answer = answerOf(answers[question.id] ?? { choice: "", typed: "" });
            return answer === "" ? [] : [{ questionId: question.id, answer }];
          })
        : [];
      const next = await propose.mutateAsync({ packageId, text, attachmentIds, answers: given });
      setProposal(next);
      setTicked(cleanChangeIds(next.changes));
      setAnswers({});
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(false);
    }
  };

  const again = () => {
    setApplied(null);
    setUndone(null);
    setHideLatest(true);
    setText("");
    setFiles([]);
  };
  const latestRun = hideLatest || !latest.data?.undoable ? null : latest.data;
  const done = applied ?? (latestRun ? { runId: latestRun.runId, count: latestRun.applied, changes: null } : null);
  const body = () => {
    if (undone) return <UndoneView result={undone} onAgain={again} />;
    if (done) {
      return (
        <AppliedView
          seasons={seasons}
          runId={done.runId}
          count={done.count}
          changes={done.changes}
          onUndone={(result) => {
            setApplied(null);
            setUndone(result);
          }}
          onAgain={again}
        />
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <ChangeInput
          text={text}
          onText={setText}
          files={files}
          onFiles={setFiles}
          working={working}
          fileProblem={!filesAreAllowed(files)}
          onShow={() => void show(false)}
        />
        <RefusalAlert error={error} />
        {proposal && proposal.questions.length > 0 && (
          <QuestionsForm
            questions={proposal.questions}
            answers={answers}
            onAnswers={setAnswers}
            working={working}
            onSubmit={() => void show(true)}
          />
        )}
        {proposal && (
          <ProposalView
            seasons={seasons}
            proposal={proposal}
            ticked={ticked}
            onTickedChange={setTicked}
            applying={apply.isPending}
            error={apply.error}
            onApply={(changes) => {
              chosen.current = changes;
              apply.mutate({ runId: proposal.runId, changeIds: changes.map((change) => change.id) });
            }}
          />
        )}
      </div>
    );
  };
  return (
    <Card className={cardTints.ai}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon aria-hidden="true" className="size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>{body()}</CardContent>
    </Card>
  );
}
