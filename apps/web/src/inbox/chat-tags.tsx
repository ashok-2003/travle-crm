"use client";

// A chat's tags in its contact panel (sales inbox spec, section 5): the agency's tags as chips to switch on and off, for
// whoever may reply; the Owner and Admins can also add a new tag here, which goes straight onto the chat. Everyone else
// sees the chat's tags only.
import { createInboxTagInput, MAX_TAGS_ON_A_CHAT, type ConversationHeader } from "@travel-crm/contracts/inbox";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useCreateTag, useMayCurate, useSetTags, useTags } from "./use-inbox-tools";

export function ChatTags({ header }: { header: ConversationHeader }) {
  const t = useTranslations("inbox.panel");
  const mayReply = useHolds("inbox:reply");
  const mayCurate = useMayCurate();
  const access = useWriteAccess("change");
  const tags = useTags();
  const setTags = useSetTags();
  const create = useCreateTag();
  const [name, setName] = useState("");
  const chosen = header.tags.map((tag) => tag.id);
  const editable = mayReply && header.state === "open";

  if (!editable) {
    return header.tags.length === 0 ? (
      <p className="text-muted-foreground">{t("noTags")}</p>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {header.tags.map((tag) => (
          <Badge key={tag.id} variant="secondary">
            {tag.name}
          </Badge>
        ))}
      </div>
    );
  }
  const busy = setTags.isPending || create.isPending;
  const addTag = () => {
    const parsed = createInboxTagInput.safeParse({ name });
    if (!parsed.success) return;
    create.mutate(parsed.data, {
      onSuccess: (tag) => {
        setName("");
        setTags.mutate({ conversationId: header.id, tagIds: [...chosen, tag.id].slice(0, MAX_TAGS_ON_A_CHAT) });
      },
    });
  };
  return (
    <div className="flex flex-col gap-3">
      {tags.data !== undefined && tags.data.length > 0 ? (
        <ToggleGroup
          type="multiple"
          variant="outline"
          spacing={2}
          className="flex-wrap"
          aria-label={t("tags")}
          value={chosen}
          disabled={!access.allowed || busy}
          onValueChange={(tagIds) => {
            setTags.mutate({ conversationId: header.id, tagIds: tagIds.slice(0, MAX_TAGS_ON_A_CHAT) });
          }}
        >
          {tags.data.map((tag) => (
            <ToggleGroupItem key={tag.id} value={tag.id} className="rounded-full px-3">
              {tag.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <p className="text-muted-foreground">{mayCurate ? t("firstTag") : t("noAgencyTags")}</p>
      )}
      {mayCurate && (
        <form
          className="flex"
          onSubmit={(event) => {
            event.preventDefault();
            addTag();
          }}
        >
          <InputGroup>
            <InputGroupInput
              aria-label={t("newTag")}
              placeholder={t("newTagPlaceholder")}
              maxLength={40}
              value={name}
              disabled={!access.allowed || busy}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <InputGroupAddon align="inline-end">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label={t("addTag")}
                disabled={!access.allowed || busy || name.trim() === ""}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </form>
      )}
      <RefusalAlert error={setTags.error ?? create.error} />
    </div>
  );
}
