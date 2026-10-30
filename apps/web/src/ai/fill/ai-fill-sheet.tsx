"use client";

// "Fill it for me" (release ai2a): say it with the mic, type it, paste a chat, or show a screenshot; the AI proposes values for
// the form, and the person ticks what to take. Fields the form has empty start ticked; fields that already hold a value start
// unticked and show before and after, with the words each came from. Apply copies the ticked values into the open form, unsaved:
// nothing is sent to the server by Apply. One fill is one of the agency's monthly AI calls, given back when the AI doesn't answer.
import type { AiFillProposal, FillPath, FillTarget } from "@travel-crm/contracts/ai";
import { MicIcon, PaperclipIcon, SquareIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import type { ReturnFocusTo } from "@/components/return-focus";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { readWhatsAppExport } from "../whatsapp-export";
import { useFillText } from "./fill-text";
import { useRecorder } from "./use-recorder";
import { useFill, useUploadAiInput } from "./use-ai-fill";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface Media {
  blob: Blob;
  type: "audio/wav" | ImageType;
}

/** A pasted WhatsApp chat as "Name: words" lines, without its timestamps; anything else as it was. */
function withoutTimestamps(text: string): string {
  const messages = readWhatsAppExport(text);
  return messages.length < 2 ? text : messages.map((message) => `${message.sender}: ${message.text}`).join("\n");
}

const groupOf = (path: FillPath) => (path.startsWith("call.") ? "call" : "rest");
const pathKey = (path: FillPath) => path.replace(".", "_");

export function AiFillSheet({
  target,
  subjectId,
  open,
  onOpenChange,
  current,
  onApply,
  chatId,
  returnFocusTo,
}: {
  target: FillTarget;
  subjectId?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the form holds now, to show beside what the AI found and to start filled fields unticked. */
  current: Partial<Record<FillPath, unknown>>;
  onApply: (proposal: AiFillProposal, ticked: FillPath[]) => void;
  /** A chat to read at once (Make a lead from this chat): no typing needed. */
  chatId?: string | undefined;
  returnFocusTo?: ReturnFocusTo | undefined;
}) {
  const t = useTranslations("ai.fill.sheet");
  const paths = useTranslations("ai.fill.paths");
  const sources = useTranslations("ai.fill.sources");
  const textOf = useFillText();
  const fill = useFill(target);
  const upload = useUploadAiInput();
  const [text, setText] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const [proposal, setProposal] = useState<AiFillProposal | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<FillPath>>(new Set());
  const picker = useRef<HTMLInputElement>(null);
  const recorder = useRecorder((wav) => {
    setMedia({ blob: wav, type: "audio/wav" });
  });
  const busy = uploading || fill.isPending || recorder.working;

  const show = (next: AiFillProposal) => {
    setProposal(next);
    // What the form has empty is taken unless unticked; what it already holds is left unless ticked.
    setTicked(new Set(next.fields.filter((field) => current[field.path] === undefined).map((field) => field.path)));
  };

  async function run(source: "chat" | "input") {
    setProblem(null);
    try {
      const words = withoutTimestamps(text);
      let input;
      if (source === "chat" && chatId !== undefined) input = { kind: "chat" as const, conversationId: chatId };
      else if (media !== null) {
        setUploading(true);
        const attachmentId = await upload(media.blob, media.type);
        setUploading(false);
        input = { kind: "upload" as const, attachmentId, ...(words === "" ? {} : { text: words }) };
      } else input = { kind: "text" as const, text: words };
      show(await fill.mutateAsync({ target, ...(subjectId === undefined ? {} : { subjectId }), source: input }));
    } catch (error) {
      setUploading(false);
      setProblem(error);
    }
  }

  const started = useRef(false);
  // Closed, the sheet forgets: the next opening starts with nothing said.
  const changeOpen = (next: boolean) => {
    if (!next) {
      if (recorder.recording) recorder.stop();
      setProposal(null);
      setText("");
      setMedia(null);
      setProblem(null);
      started.current = false;
    }
    onOpenChange(next);
  };

  // "Make a lead from this chat" reads the chat as soon as the sheet opens.
  useEffect(() => {
    if (open && chatId !== undefined && !started.current) {
      started.current = true;
      void run("chat");
    }
  });

  const chooseImage = (file: File | undefined) => {
    if (file === undefined) return;
    if (!IMAGE_TYPES.includes(file.type as ImageType) || file.size > MAX_IMAGE_BYTES) {
      toast.error(t("imageRefused"));
      return;
    }
    setMedia({ blob: file, type: file.type as ImageType });
  };
  const onPaste = (event: ClipboardEvent) => {
    const image = [...event.clipboardData.files].find((file) => file.type.startsWith("image/"));
    if (image !== undefined) {
      event.preventDefault();
      chooseImage(image);
    }
  };

  const fields = proposal?.fields ?? [];
  const groups = new Set(fields.map((field) => groupOf(field.path)));
  const rows = (group: string) => fields.filter((field) => groupOf(field.path) === group);

  const clock = `${String(Math.floor(recorder.seconds / 60))}:${String(recorder.seconds % 60).padStart(2, "0")}`;
  const ready = text.trim() !== "" || media !== null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      busy={busy}
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={proposal === null ? t("description") : t("reviewDescription")}
      footer={
        proposal === null ? (
          chatId === undefined && (
            <Button
              disabled={!ready || busy || recorder.recording}
              onClick={() => {
                void run("input");
              }}
            >
              {busy && <Spinner />}
              {busy ? t("reading") : t("fill")}
            </Button>
          )
        ) : (
          <>
            {chatId === undefined && (
              <Button
                variant="outline"
                onClick={() => {
                  setProposal(null);
                }}
              >
                {t("back")}
              </Button>
            )}
            <Button
              disabled={ticked.size === 0}
              onClick={() => {
                onApply(proposal, [...ticked]);
                changeOpen(false);
              }}
            >
              {t("apply", { count: ticked.size })}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {proposal === null ? (
          chatId !== undefined ? (
            <p role="status" className="flex items-center gap-2 text-muted-foreground">
              {busy && <Spinner />}
              {t("readingChat")}
            </p>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="ai-fill-text">{t("textLabel")}</FieldLabel>
                <Textarea
                  id="ai-fill-text"
                  rows={5}
                  value={text}
                  disabled={busy}
                  onChange={(event) => {
                    setText(event.target.value);
                  }}
                  onPaste={onPaste}
                />
                <FieldDescription>{t("textHint")}</FieldDescription>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (recorder.recording) recorder.stop();
                    else void recorder.start();
                  }}
                >
                  {recorder.recording ? <SquareIcon aria-hidden="true" /> : <MicIcon aria-hidden="true" />}
                  {recorder.recording ? t("micStop", { time: clock }) : t("mic")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || recorder.recording}
                  onClick={() => picker.current?.click()}
                >
                  <PaperclipIcon aria-hidden="true" />
                  {t("addImage")}
                </Button>
                <input
                  ref={picker}
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label={t("addImage")}
                  onChange={(event) => {
                    chooseImage(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>
              {recorder.problem !== null && (
                <p role="alert" className="text-destructive">
                  {t(
                    recorder.problem === "denied"
                      ? "micDenied"
                      : recorder.problem === "unsupported"
                        ? "micUnsupported"
                        : "micUnreadable",
                  )}
                </p>
              )}
              {media !== null && (
                <p className="flex items-center gap-2">
                  <span>{t(media.type === "audio/wav" ? "recordingReady" : "imageReady")}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setMedia(null);
                    }}
                  >
                    <XIcon aria-hidden="true" />
                    {t("remove")}
                  </Button>
                </p>
              )}
            </>
          )
        ) : (
          <>
            {proposal.truncated && <p className="text-muted-foreground">{t("truncated")}</p>}
            {proposal.questions.length > 0 && (
              <Alert>
                <AlertTitle>{t("questions")}</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {proposal.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {fields.length === 0 && <p>{t("nothingYet")}</p>}
            {[...groups].sort().map((group) => (
              <FieldSet key={group}>
                {groups.size > 1 && <FieldLegend variant="label">{t(`groups.${group as "call"}`)}</FieldLegend>}
                {rows(group).map((field) => {
                  const old = current[field.path];
                  const id = `fill-${field.path}`;
                  return (
                    <Field key={field.path} orientation="horizontal" className="min-h-11">
                      <Checkbox
                        id={id}
                        checked={ticked.has(field.path)}
                        onCheckedChange={(on) => {
                          setTicked((before) => {
                            const next = new Set(before);
                            if (on === true) next.add(field.path);
                            else next.delete(field.path);
                            return next;
                          });
                        }}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={id} className="font-normal">
                          <span className="font-medium">{paths(pathKey(field.path) as "person_name")}</span>
                          <span className="text-people-tint-ink">{textOf(field.path, field.value)}</span>
                        </FieldLabel>
                        <FieldDescription>
                          {old !== undefined && <span>{t("now", { value: textOf(field.path, old) })} </span>}
                          {field.excerpt !== "" && (
                            <span>{t("from", { source: sources(field.from), words: field.excerpt })}</span>
                          )}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldSet>
            ))}
          </>
        )}
        <RefusalAlert error={problem} />
      </div>
    </ResponsiveDialog>
  );
}
