"use client";

// After a follow-up is done: "When's the next follow-up?". Tomorrow, In 3 days or Next week add one on the same lead, with
// the same words, at the same time of day in the agency's zone; No more follow-ups just closes. The request holds the
// dialog open while it is out (rule 7), and its success closes it from the mutation's own options (Ruling P).
import { addLeadWorkInput } from "@travel-crm/contracts/crm";
import { addDays, calendarDateIn, timeOfDayIn } from "@travel-crm/domain/kernel";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useMe } from "@/session/me-context";

/** The follow-up just done, as far as the next one needs it. */
export interface NextFollowUpTarget {
  leadId: string;
  title: string;
  dueAt: string;
}

const choices = [
  { key: "tomorrow", days: 1 },
  { key: "inThreeDays", days: 3 },
  { key: "nextWeek", days: 7 },
] as const;

export function NextFollowUpDialog({ target, onClose }: { target: NextFollowUpTarget | null; onClose: () => void }) {
  const t = useTranslations("tasks.followUps.nextDialog");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const { timeZone } = useMe().organization;
  const add = useMutation(
    trpc.leads.addWork.mutationOptions({
      onSuccess: async () => {
        onClose();
        await refresh();
        toast.success(t("added"));
      },
    }),
  );
  const choose = (days: number) => {
    if (target === null) return;
    const input = addLeadWorkInput.parse({
      leadId: target.leadId,
      kind: "follow-up",
      title: target.title,
      due: {
        on: addDays(calendarDateIn(new Date(), timeZone), days),
        at: timeOfDayIn(new Date(target.dueAt), timeZone),
      },
    });
    add.mutate(input);
  };
  return (
    <ResponsiveDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          add.reset();
          onClose();
        }
      }}
      busy={add.isPending}
      title={t("title")}
      description={t("description")}
      cancel={false}
      footer={
        <Button variant="outline" disabled={add.isPending} onClick={onClose}>
          {t("none")}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <RefusalAlert error={add.error} />
        {choices.map((choice) => (
          <Button
            key={choice.key}
            variant="outline"
            disabled={add.isPending}
            onClick={() => {
              choose(choice.days);
            }}
          >
            {t(choice.key)}
          </Button>
        ))}
      </div>
    </ResponsiveDialog>
  );
}
