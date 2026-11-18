"use client";

// "Your tasks today" (spec 5): the first five of My tasks' overdue, due today and new leads, the AI's items left to
// Needs your attention, then the follow-ups line. View all opens My tasks.
import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { routes } from "@/lib/routes";
import { todayItemId } from "@/today/today-item";
import { useMyTasksPreview } from "@/today/use-today";
import { HomeCard } from "./home-card";
import { TaskLine } from "./task-line";

export function TasksCard() {
  const t = useTranslations("home.tasks");
  const tasks = useMyTasksPreview(5);
  return (
    <HomeCard title={t("title")} viewAll={routes.today}>
      {tasks.isError ? (
        <LoadFailedAlert message={t("loadFailed")} error={tasks.error} onRetry={tasks.refetch} />
      ) : tasks.items === undefined ? (
        <LoadingRows rows={3} />
      ) : tasks.items.length === 0 ? (
        <p className="text-muted-foreground">{t("nothing")}</p>
      ) : (
        <ItemGroup>
          {tasks.items.map((item, index) => (
            // The index too: a thing can sit in two of the sections for a moment, as a refresh lands.
            <Fragment key={`${todayItemId(item)}-${String(index)}`}>
              {index > 0 && <ItemSeparator />}
              <div role="listitem">
                <TaskLine item={item} />
              </div>
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </HomeCard>
  );
}
