"use client";

// The prices the AI's cost is worked out from: each listed model's dollars per million tokens read and written, in rupees
// at the console's rate too, and an announced change with its day (Gemini 3.8 Flash doubles on 1 Jan 2027).
import type { AiModelPrice } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDay } from "@/lib/format";
import { rupeesOf } from "../growth/usage-screen";

export function AiPrices({ prices, rate }: { prices: AiModelPrice[]; rate: number }) {
  const t = useTranslations("consoleAi.prices");
  const price = (usd: number) => `$${usd.toFixed(2)} (${rupeesOf(Math.round(usd * rate * 100))})`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <CardDescription>{t("intro", { rate: String(rate) })}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("model")}</TableHead>
              <TableHead className="text-right">{t("input")}</TableHead>
              <TableHead className="text-right">{t("output")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.map((row) => (
              <TableRow key={row.model}>
                <TableCell>
                  <span className="numbers">{row.model}</span>
                  {row.changesOn !== null &&
                    row.nextInputUsdPerMillion !== null &&
                    row.nextOutputUsdPerMillion !== null && (
                      <span className="block text-caption text-status-attention-ink">
                        {t("change", {
                          day: formatCalendarDay(row.changesOn),
                          input: price(row.nextInputUsdPerMillion),
                          output: price(row.nextOutputUsdPerMillion),
                        })}
                      </span>
                    )}
                </TableCell>
                <TableCell className="numbers text-right">{price(row.inputUsdPerMillion)}</TableCell>
                <TableCell className="numbers text-right">{price(row.outputUsdPerMillion)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
