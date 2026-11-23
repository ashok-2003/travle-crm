"use client";

// The AI agent page's switch for each WhatsApp number (spec 2026-11-22 section 8): the agency's live numbers, the main
// one first, each with its own AI switch under the agency's. Shown once the agency has two live numbers, and also while
// its one number is switched off, so a switch left off after the other number went is never out of reach. Each switch
// needs ai:manage and a fresh session (the api checks); the setup that comes back is what the page then shows.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTRPC } from "@/data/trpc";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useAgentSetup } from "./use-agent";

export function NumberSwitches() {
  const t = useTranslations("aiAgent.numbers");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const id = useId();
  const access = useWriteAccess("change");
  const setup = useAgentSetup().data;
  const change = useMutation(
    trpc.ai.setNumberAnswers.mutationOptions({
      onSuccess: (next) => {
        queryClient.setQueryData(trpc.ai.agentSetup.queryKey(), next);
      },
      // A refusal means the numbers the page showed were out of date: read them again.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.ai.agentSetup.queryKey() }),
    }),
  );
  if (setup === undefined) return null;
  const { numbers } = setup;
  if (numbers.length < 2 && numbers.every((number) => number.aiAnswers)) return null;
  const hintId = `${id}-write`;
  return (
    <Card role="region" aria-labelledby={`${id}-title`}>
      <CardHeader>
        <CardTitle>
          <h2 id={`${id}-title`}>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ItemGroup>
          {numbers.map((number) => (
            <Item key={number.id} size="sm">
              <ItemContent>
                <ItemTitle>
                  <Label htmlFor={`${id}-${number.id}`}>{number.label}</Label>
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                <Switch
                  id={`${id}-${number.id}`}
                  checked={number.aiAnswers}
                  disabled={change.isPending || !access.allowed}
                  aria-describedby={access.hint === null ? undefined : hintId}
                  onCheckedChange={(on) => {
                    change.mutate({ connectionId: number.id, on });
                  }}
                />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
        <WriteHint id={hintId} hint={access.hint} />
        <RefusalAlert error={change.error} />
      </CardContent>
    </Card>
  );
}
