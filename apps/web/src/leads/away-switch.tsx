"use client";

// For someone in the pool that takes new leads in turn (release 4, Settings > Lead assignment): mark yourself away for
// a day, three or a week, so the turns skip you, or come back at once. Shown only to people in the pool, at the top of
// Today and on the account page, with when they are back.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { useTRPC } from "@/data/trpc";
import { formatDayTime } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";

const DAY_MS = 24 * 60 * 60 * 1000;
const awayFor = [1, 3, 7] as const;

function AwaySwitchCard() {
  const t = useTranslations("leads.away");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { timeZone } = useMe().organization;
  const write = useWriteAccess("change");
  const place = useQuery(trpc.assignment.mine.queryOptions());
  const setAway = useMutation(
    trpc.assignment.setAway.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.assignment.pathKey() }),
    }),
  );
  if (!place.data?.inPool) return null;
  const until = place.data.awayUntil === null ? null : new Date(place.data.awayUntil);
  const away = until !== null && until > new Date();
  return (
    // Small and in the action tint (owner, 2026-11-19): a setting beside the day's work, not a section of it. From
    // tablets up the buttons sit beside the words.
    <Card size="sm" className="bg-accent">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>
              {away ? t("awayUntil", { when: formatDayTime(until, { timeZone }) }) : t("taking")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {away ? (
              <Button
                variant="outline"
                size="sm"
                disabled={setAway.isPending || !write.allowed}
                aria-describedby={write.hint === null ? undefined : "away-write-hint"}
                onClick={() => {
                  setAway.mutate({ awayUntil: null });
                }}
              >
                {t("back")}
              </Button>
            ) : (
              awayFor.map((days) => (
                <Button
                  key={days}
                  variant="outline"
                  size="sm"
                  disabled={setAway.isPending || !write.allowed}
                  aria-describedby={write.hint === null ? undefined : "away-write-hint"}
                  onClick={() => {
                    setAway.mutate({ awayUntil: new Date(Date.now() + days * DAY_MS).toISOString() });
                  }}
                >
                  {t("for", { days })}
                </Button>
              ))
            )}
          </div>
        </div>
        <WriteHint id="away-write-hint" hint={write.hint} />
        {setAway.isError && <RefusalAlert error={setAway.error} />}
      </CardContent>
    </Card>
  );
}

/** Only for someone who works leads, who may be in the pool. */
export function AwaySwitch() {
  const holdsView = useHolds("leads:view");
  return holdsView ? <AwaySwitchCard /> : null;
}
