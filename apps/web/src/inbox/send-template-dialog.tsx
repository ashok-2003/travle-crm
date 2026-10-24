"use client";

// Send a template (spec 3.3): choose one of the approved templates, fill its blanks (the customer's first name and the sender's
// are filled in; the rest are typed), see the message as it will read, tick "they agreed to WhatsApp messages" when we start a
// chat or they had asked to stop and wrote again, and send. A person who asked to stop gets no choice at all. A marketing
// template shows how much of the month's allowance is left. The dialog holds while the request is out.
import {
  markersOf,
  templateVariables,
  type ConversationHeader,
  type TemplateSummary,
} from "@travel-crm/contracts/inbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { formatPhoneNumber } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useConversation } from "./use-inbox";
import { useSendableTemplates } from "./use-templates";

const knownVariable = (variable: string | undefined) =>
  templateVariables.find((known) => known === variable) ?? "custom";

const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** The text of a template with the values in its blanks, the blank itself while it is empty. */
export const preview = (body: string, values: readonly string[]) =>
  body.replace(/\{\{(\d+)\}\}/g, (marker, index: string) => {
    const value = values[Number(index) - 1];
    return value === undefined || value.trim() === "" ? marker : value;
  });

/** The month of a stored calendar day, as a word ("December"). */
const monthName = (day: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(new Date(day));

/** What the CRM knows already, for each blank by the fact the template says fills it. Staff may change every value. */
function prefilled(
  template: TemplateSummary,
  header: ConversationHeader,
  who: { sender: string; agency: string },
): string[] {
  return template.variables.map((variable) => {
    switch (variable) {
      case "customer_name":
        return firstWord(header.name ?? "");
      case "agent_name":
        return firstWord(who.sender);
      case "agency_name":
        return who.agency;
      case "destination":
        return header.trip.destination ?? "";
      case "travel_month":
        return header.trip.travelMonth === null ? "" : monthName(header.trip.travelMonth);
      default:
        return "";
    }
  });
}

function Body({
  header,
  templates,
  formId,
  sending,
}: {
  header: ConversationHeader;
  templates: TemplateSummary[];
  formId: string;
  sending: { mutate: (input: SendInput) => void; isPending: boolean; error: unknown };
}) {
  const t = useTranslations("inbox.sendTemplate");
  const me = useMe();
  const [chosenId, setChosenId] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const tick = useId();
  const template = templates.find((candidate) => candidate.id === chosenId);
  const needsTick = !header.agreed || header.optedOut;
  const showTick = header.lastInboundAt === null || header.optedOut;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (template === undefined) return;
        sending.mutate({ templateId: template.id, parameters: values, agreed: needsTick && showTick ? agreed : false });
      }}
    >
      <FieldGroup>
        <ChoiceGroup
          legend={t("choose")}
          value={chosenId}
          onChange={(id) => {
            setChosenId(id);
            const next = templates.find((candidate) => candidate.id === id);
            if (next !== undefined) {
              setValues(prefilled(next, header, { sender: me.user.name, agency: me.organization.name }));
            }
          }}
          options={templates.map((candidate) => ({
            value: candidate.id,
            label: candidate.name,
            description: candidate.body,
          }))}
        />
        {template !== undefined &&
          markersOf(template.body).map((number, index) => (
            <Field key={number}>
              <FieldLabel htmlFor={`${tick}-${String(number)}`}>
                {t(`blankOf.${knownVariable(template.variables[index])}`, { number })}
              </FieldLabel>
              <Input
                id={`${tick}-${String(number)}`}
                value={values[index] ?? ""}
                autoComplete="off"
                dir="auto"
                maxLength={200}
                onChange={(event) => {
                  const next = [...values];
                  next[index] = event.target.value;
                  setValues(next);
                }}
              />
            </Field>
          ))}
        {template !== undefined && (
          <p
            className="rounded-md bg-muted p-3 whitespace-pre-wrap script-leading"
            dir="auto"
            aria-label={t("previewLabel")}
          >
            {preview(template.body, values)}
          </p>
        )}
        {template !== undefined && showTick && needsTick && (
          <Field orientation="horizontal">
            <Checkbox
              id={`${tick}-agreed`}
              checked={agreed}
              onCheckedChange={(next) => {
                setAgreed(next === true);
              }}
            />
            <FieldLabel htmlFor={`${tick}-agreed`} className="font-normal">
              {t("agreed")}
            </FieldLabel>
          </Field>
        )}
      </FieldGroup>
      <RefusalAlert error={sending.error} />
    </form>
  );
}

interface SendInput {
  templateId: string;
  parameters: string[];
  agreed: boolean;
}

export function SendTemplateDialog({
  conversationId,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("inbox.sendTemplate");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const formId = useId();
  const header = useConversation(conversationId);
  const sendable = useSendableTemplates(open);
  const [token, setToken] = useState(() => crypto.randomUUID());
  const send = useMutation(
    trpc.inbox.sendTemplate.mutationOptions({
      onSuccess: async () => {
        setToken(crypto.randomUUID());
        await queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() });
        toast.success(t("done"));
        onOpenChange(false);
      },
    }),
  );
  const data = header.data;
  const templates = sendable.data?.items ?? [];
  const body = () => {
    if (data === undefined || sendable.data === undefined)
      return <p className="text-muted-foreground">{t("loading")}</p>;
    if (data.optedOut && data.lastInboundAt === null) return <p>{t("optedOut")}</p>;
    if (templates.length === 0) return <p>{t("none")}</p>;
    return (
      <Body
        header={data}
        templates={templates}
        formId={formId}
        sending={{
          mutate: (input) => {
            send.mutate({ conversationId, clientToken: token, ...input });
          },
          isPending: send.isPending,
          error: send.error,
        }}
      />
    );
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) send.reset();
        onOpenChange(next);
      }}
      busy={send.isPending}
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={
        data === undefined ? t("loading") : t("description", { name: data.name ?? formatPhoneNumber(data.phone) })
      }
      footer={
        <Button
          type="submit"
          form={formId}
          disabled={
            send.isPending || templates.length === 0 || (data?.optedOut === true && data.lastInboundAt === null)
          }
        >
          {send.isPending && <Spinner />}
          {send.isPending ? t("sending") : t("send")}
        </Button>
      }
    >
      {open && body()}
    </ResponsiveDialog>
  );
}
