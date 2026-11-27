// A quote's price in whole rupees for the customer's page and the quotation PDF: each line rounded to the rupee, then one
// GST row that is the total less those lines, so the printed numbers always add up. The exact tax is on the tax invoice.

export interface WholeRupeePrice {
  /** Each line's amount rounded to whole rupees, in paise. */
  linesPaise: number[];
  /** The total less the rounded lines; null when the quote carries no tax. */
  gstPaise: number | null;
}

export function wholeRupeePrice(amountsPaise: number[], totalPaise: number, taxPaise: number): WholeRupeePrice {
  const linesPaise = amountsPaise.map((paise) => Math.round(paise / 100) * 100);
  const gstPaise = taxPaise > 0 ? totalPaise - linesPaise.reduce((sum, paise) => sum + paise, 0) : null;
  return { linesPaise, gstPaise };
}

/** "GST 5%", "GST 2.5%". */
export const gstLabel = (taxRateBasisPoints: number) => `GST ${String(taxRateBasisPoints / 100)}%`;
