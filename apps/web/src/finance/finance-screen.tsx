"use client";

// /finance (step 6, P0): the agency's money for whoever keeps its accounts. A period above everything (this month, last
// month, three months, this financial year), then Overview (profit, cash, months), Bookings (each one's profit) and
// Expenses (the running costs).
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCalendarDay } from "@/lib/format";
import { BookingsTable } from "./bookings-table";
import { ExpensesList } from "./expenses-list";
import { FinanceOverview } from "./finance-overview";
import { financePeriods, periodOf, useToday, type FinancePeriod } from "./use-finance";

const isPeriod = (value: string): value is FinancePeriod => financePeriods.some((period) => period === value);

export function FinanceScreen() {
  const t = useTranslations("finance");
  const today = useToday();
  const [chosen, setChosen] = useState<FinancePeriod>("thisMonth");
  const period = periodOf(chosen, today);
  return (
    <div className="flex max-w-[1200px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      <div className="flex flex-col gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={t("periodLabel")}
          value={chosen}
          onValueChange={(value) => {
            if (isPeriod(value)) setChosen(value);
          }}
          className="flex-wrap"
        >
          {financePeriods.map((one) => (
            <ToggleGroupItem key={one} value={one} className="min-h-11 px-4">
              {one === chosen && <CheckIcon aria-hidden="true" />}
              {t(`periods.${one}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-label text-muted-foreground">
          {t("range", { from: formatCalendarDay(period.from), to: formatCalendarDay(period.to) })}
        </p>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="bookings">{t("tabs.bookings")}</TabsTrigger>
          <TabsTrigger value="expenses">{t("tabs.expenses")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <FinanceOverview period={period} />
        </TabsContent>
        <TabsContent value="bookings" className="pt-4">
          <BookingsTable />
        </TabsContent>
        <TabsContent value="expenses" className="pt-4">
          <ExpensesList period={period} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
