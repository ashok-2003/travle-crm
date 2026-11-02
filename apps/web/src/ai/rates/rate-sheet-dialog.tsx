"use client";

// "Read a rate sheet" on a supplier's Rates (release ai3b): the person gives a PDF, an Excel file or up to four photos; the AI
// copies the rates it finds, each beside the words it came from; the person fixes, ticks every price they checked, and saves
// through the supplier's own rate writes. A sheet too big for one read is offered by tab or pages first, each read another of the
// month's AI calls, said before it is made. Nothing is saved until the person saves; the AI never writes.
import type { RateSheetProposal } from "@travel-crm/contracts/ai";
import type { RateSeason } from "@travel-crm/contracts/suppliers";
import { PaperclipIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ItemGroup } from "@/components/ui/item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { UploadError } from "@/files/upload";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { batchOf, draftOf, saveState, SUPPLIER_SEASON_KEY, type DraftValues } from "./rate-sheet-draft";
import { RateSheetRow } from "./rate-sheet-row";
import { RateSheetSeasons } from "./rate-sheet-seasons";
import {
  XLSX_TYPE,
  useRateSheetSource,
  useReadRateSheet,
  useSaveRateBatch,
  useUploadRateSheet,
  type RateSheetContentType,
} from "./use-rate-sheet";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 4;
const OLD_EXCEL = ["application/vnd.ms-excel"];

const isPhoto = (type: string) => (PHOTO_TYPES as readonly string[]).includes(type);

export function RateSheetDialog({
  supplierId,
  supplierSeasons,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  supplierId: string;
  supplierSeasons: readonly RateSeason[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: ReturnFocusTo | undefined;
}) {
  const t = useTranslations("ai.rates");
  const { apiError } = useErrorMessage();
  const write = useWriteAccess("change");
  const reader = useReadRateSheet();
  const upload = useUploadRateSheet();
  const source = useRateSheetSource();
  const saver = useSaveRateBatch();
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const [proposal, setProposal] = useState<RateSheetProposal | null>(null);
  const [part, setPart] = useState<string>("");
  const [savedParts, setSavedParts] = useState(0);
  const form = useForm<DraftValues>({ defaultValues: { seasons: [], rows: [] } });
  // What the form holds now (useWatch types every field as possibly missing; the form always holds whole drafts).
  const values = useWatch({ control: form.control }) as DraftValues;
  const state = saveState(values, supplierSeasons);
  const busy = uploading || reader.isPending || saver.isPending;
  const choosing = proposal !== null && proposal.part === null;
  const reviewing = proposal !== null && proposal.part !== null;

  const forget = () => {
    setFiles([]);
    setAttachmentIds(null);
    setProposal(null);
    setProblem(null);
    setPart("");
    setSavedParts(0);
    form.reset({ seasons: [], rows: [] });
    reader.reset();
    saver.reset();
  };
  const changeOpen = (next: boolean) => {
    if (!next) forget();
    onOpenChange(next);
  };

  const choose = (list: FileList | null) => {
    if (list === null) return;
    const chosen = [...list];
    const next = [...files, ...chosen];
    const bad = next.find((file) => OLD_EXCEL.includes(file.type) || file.name.toLowerCase().endsWith(".xls"));
    if (bad !== undefined) return void toast.error(t("refused.old"));
    const documents = next.filter((file) => !isPhoto(file.type));
    const allowed = (file: File) => isPhoto(file.type) || file.type === "application/pdf" || file.type === XLSX_TYPE;
    if (!next.every(allowed)) return void toast.error(t("refused.type"));
    if ((documents.length > 0 && next.length > 1) || next.length - documents.length > MAX_PHOTOS) {
      return void toast.error(t("refused.mix"));
    }
    if (next.some((file) => file.size > (isPhoto(file.type) ? MAX_PHOTO_BYTES : MAX_FILE_BYTES))) {
      return void toast.error(t("refused.size"));
    }
    setFiles(next);
    setProblem(null);
  };

  async function run(chosenPart?: number) {
    setProblem(null);
    try {
      let ids = attachmentIds;
      if (ids === null) {
        setUploading(true);
        ids = [];
        for (const file of files) ids.push(await upload(file, file.type as RateSheetContentType));
        setUploading(false);
        setAttachmentIds(ids);
      }
      const found = await reader.mutateAsync({
        supplierId,
        attachmentIds: ids,
        ...(chosenPart === undefined ? {} : { part: chosenPart }),
      });
      setProposal(found);
      if (found.part !== null) form.reset(draftOf(found));
    } catch (error) {
      setUploading(false);
      setProblem(error);
    }
  }

  const failure = (error: unknown) =>
    error instanceof UploadError ? t(error.status === 0 ? "storageUnreachable" : "storageRefused") : apiError(error);

  const save = () => {
    if (proposal?.fillId == null) return;
    const batch = batchOf(form.getValues(), supplierSeasons, { supplierId, fillId: proposal.fillId });
    if (batch === null) return;
    saver.mutate(batch, {
      onSuccess: (done) => {
        toast.success(t("saved", { count: done.rates }));
        // A sheet read by parts goes on to the next one; a whole sheet is done.
        if (proposal.parts.length > 1) {
          setSavedParts((count) => count + 1);
          setProposal({ ...proposal, part: null, fillId: null, seasons: [], rates: [], questions: [] });
          form.reset({ seasons: [], rows: [] });
          setPart("");
        } else changeOpen(false);
      },
    });
  };

  const openSource = (where: string) => {
    const photo = /^Photo (\d+)$/.exec(where);
    const file = proposal?.sources[photo === null ? 0 : Number(photo[1]) - 1];
    if (file === undefined) return;
    // Opened at once, so the browser allows the tab; the link arrives a moment later.
    const tab = window.open("", "_blank");
    const page = /^Page (\d+)$/.exec(where)?.[1];
    source.mutate(
      { recordId: file.recordId, attachmentId: file.attachmentId },
      {
        onSuccess: (link) => {
          if (tab === null) return;
          tab.opener = null;
          tab.location.href = page === undefined ? link.url : `${link.url}#page=${page}`;
        },
        onError: () => tab?.close(),
      },
    );
  };

  const existingLabels = new Map(supplierSeasons.map((season) => [season.id, season.label] as const));
  const seasonOptions = [
    ...values.seasons
      .filter((season) => season.label !== "" || season.startsOn !== "")
      .map((season) => ({ value: String(season.key), label: season.label })),
    ...supplierSeasons.map((season, index) => ({ value: String(SUPPLIER_SEASON_KEY + index), label: season.label })),
  ];
  const canOpenSource =
    (proposal?.sources.length ?? 0) > 0 && !(proposal?.sources[0]?.contentType ?? "").includes("sheet");
  const hintId = "rate-sheet-save-hint";

  const footer = reviewing ? (
    <>
      {proposal.parts.length > 1 && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setProposal({ ...proposal, part: null, fillId: null, seasons: [], rates: [], questions: [] });
            form.reset({ seasons: [], rows: [] });
          }}
        >
          {t("anotherPart")}
        </Button>
      )}
      <Button disabled={busy || !state.canSave || !write.allowed} aria-describedby={hintId} onClick={save}>
        {saver.isPending && <Spinner />}
        {t("save", { count: state.count })}
      </Button>
    </>
  ) : choosing ? (
    <Button disabled={busy || part === ""} onClick={() => void run(Number(part))}>
      {reader.isPending && <Spinner />}
      {reader.isPending ? t("reading") : t("readPart")}
    </Button>
  ) : (
    <Button disabled={busy || files.length === 0} onClick={() => void run()}>
      {busy && <Spinner />}
      {uploading ? t("uploading") : reader.isPending ? t("reading") : t("read")}
    </Button>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      busy={busy}
      wide
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={reviewing ? t("reviewDescription") : choosing ? t("partsDescription") : t("description")}
      footer={
        <>
          {footer}
          {reviewing && (
            <p id={hintId} className="text-caption text-muted-foreground sm:order-first sm:mr-auto sm:self-center">
              {state.unticked > 0
                ? t("untickedLeft", { count: state.unticked })
                : state.canSave
                  ? t("readyToSave")
                  : t("fixFirst")}
            </p>
          )}
          {reviewing && <WriteHint id={`${hintId}-write`} hint={write.hint} />}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {proposal === null && (
          <div className="flex flex-col gap-3">
            <input
              ref={picker}
              type="file"
              multiple
              accept=".pdf,.xlsx,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                choose(event.target.files);
                // Cleared, so choosing the same file again (after a refusal) is a change too.
                event.target.value = "";
              }}
            />
            <div className="flex flex-col items-start gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => picker.current?.click()}>
                <PaperclipIcon aria-hidden="true" />
                {files.length === 0 ? t("choose") : t("chooseMore")}
              </Button>
              <p className="text-label text-muted-foreground">{t("allowed")}</p>
            </div>
            {files.length > 0 && (
              <ul className="flex flex-col gap-1">
                {files.map((file, index) => (
                  <li key={`${file.name}-${String(index)}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-words">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      aria-label={t("removeFile", { name: file.name })}
                      onClick={() => {
                        setFiles((before) => before.filter((_, one) => one !== index));
                      }}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-caption text-muted-foreground">{t("oneRead")}</p>
          </div>
        )}

        {choosing && (
          <div className="flex flex-col gap-3">
            {savedParts > 0 && <p className="font-medium">{t("partSaved", { count: savedParts })}</p>}
            <p>{t("partsIntro", { count: proposal.parts.length })}</p>
            <RadioGroup value={part} onValueChange={setPart} aria-label={t("partsLabel")} disabled={busy}>
              {proposal.parts.map((label, index) => (
                <Field key={label} orientation="horizontal" className="min-h-11">
                  <RadioGroupItem id={`rate-part-${String(index)}`} value={String(index)} />
                  <FieldContent>
                    <FieldLabel htmlFor={`rate-part-${String(index)}`} className="font-normal">
                      {label}
                    </FieldLabel>
                  </FieldContent>
                </Field>
              ))}
            </RadioGroup>
            <FieldDescription>
              {t("partUses", { used: proposal.usedThisMonth, limit: proposal.monthlyLimit })}
            </FieldDescription>
          </div>
        )}

        {reviewing && (
          <div className="flex flex-col gap-4">
            {proposal.parts.length > 1 && proposal.part !== null && (
              <p className="font-medium">{t("thisPart", { part: proposal.parts[proposal.part] ?? "" })}</p>
            )}
            {proposal.cut && (
              <Alert>
                <AlertDescription>{t("cut")}</AlertDescription>
              </Alert>
            )}
            {proposal.questions.length > 0 && (
              <Alert>
                <AlertDescription>
                  <ul className="flex flex-col gap-1">
                    {proposal.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <RateSheetSeasons control={form.control} problems={state.seasons} existingLabels={existingLabels} />
            <section aria-labelledby="rate-sheet-rows" className="flex flex-col gap-3">
              <h3 id="rate-sheet-rows" className="font-semibold">
                {t("rows", { count: proposal.rates.length })}
              </h3>
              <ItemGroup className="gap-3">
                {proposal.rates.map((rate, index) => (
                  <RateSheetRow
                    key={rate.ref}
                    index={index}
                    control={form.control}
                    setValue={form.setValue}
                    problem={state.problems.get(index)}
                    seasonOptions={seasonOptions}
                    canOpenSource={canOpenSource || rate.source.startsWith("Photo")}
                    onOpenSource={openSource}
                  />
                ))}
              </ItemGroup>
            </section>
            <p className="text-caption text-muted-foreground">
              {t("usage", { used: proposal.usedThisMonth, limit: proposal.monthlyLimit })}
            </p>
          </div>
        )}

        {problem !== null && (
          <Alert variant="destructive">
            <AlertDescription>{failure(problem)}</AlertDescription>
          </Alert>
        )}
        <RefusalAlert error={saver.error ?? source.error} />
      </div>
    </ResponsiveDialog>
  );
}
