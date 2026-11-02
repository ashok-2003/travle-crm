// What a quote earns (release 7b): the selling price of the lines that have a cost, less that cost, as a share of those lines'
// price. Lines with no cost are left out and counted ("margin known for 3 of 5 lines"), so the warning speaks only of what is
// known. All integer paise and basis points. Below the agency's minimum margin a quote still sends: it warns, never blocks.
import type { QuoteItem, QuoteMargin, QuoteSettings } from "@travel-crm/contracts/quotes";

export type MarginSettings = Pick<QuoteSettings, "minMarginBasisPoints" | "minMarginPerPersonPaise">;

/** A line counts toward the margin when a rate gave it a cost, and a package could price it. */
const isPriced = (item: QuoteItem) => item.costUnitPaise !== undefined && item.needsRate !== true;

export function marginOf(
  items: readonly QuoteItem[],
  travellers: number,
  settings: MarginSettings,
  /** Whoever may not see margins reads the warning but no figure. */
  showFigures: boolean,
): QuoteMargin {
  let sellPaise = 0;
  let costPaise = 0;
  let pricedLines = 0;
  for (const item of items) {
    if (!isPriced(item)) continue;
    pricedLines += 1;
    sellPaise += item.unitPricePaise * item.quantity;
    costPaise += (item.costUnitPaise ?? 0) * item.quantity;
  }
  const marginPaise = sellPaise - costPaise;
  // Nothing is judged without a priced line that sells for something.
  const known = pricedLines > 0 && sellPaise > 0;
  const marginBasisPoints = known ? Math.floor((marginPaise * 10_000) / sellPaise) : null;
  const perPersonPaise = known ? Math.floor(marginPaise / Math.max(1, travellers)) : null;
  const belowShare =
    marginBasisPoints !== null &&
    settings.minMarginBasisPoints !== null &&
    marginBasisPoints < settings.minMarginBasisPoints;
  const belowPerPerson =
    perPersonPaise !== null &&
    settings.minMarginPerPersonPaise !== null &&
    perPersonPaise < settings.minMarginPerPersonPaise;
  return {
    pricedLines,
    totalLines: items.length,
    belowMinimum: belowShare || belowPerPerson,
    marginBasisPoints: showFigures ? marginBasisPoints : null,
    marginPaise: showFigures && known ? marginPaise : null,
    perPersonPaise: showFigures ? perPersonPaise : null,
  };
}

/** Lines a package could not price for these dates. */
export const needsRateLines = (items: readonly QuoteItem[]): number =>
  items.filter((item) => item.needsRate === true).length;

/** A line without the keys that tell what the agency pays: its cost and the rate it was copied from. */
function withoutCostKeys(item: QuoteItem): QuoteItem {
  const plain = { ...item };
  delete plain.costUnitPaise;
  delete plain.rateId;
  return plain;
}

/** The items as a member who may not see costs reads them: without the cost, the rate or the marker of what it was priced from. */
export const withoutCosts = (items: readonly QuoteItem[]): QuoteItem[] => items.map(withoutCostKeys);

/**
 * The items a member who may not see costs saved, with the costs the quote already held put back: they can neither read nor set
 * a cost, so a cost stays on the line it was on (the same place and the same words), and is dropped from one they rewrote.
 */
export function keepStoredCosts(incoming: readonly QuoteItem[], stored: readonly QuoteItem[]): QuoteItem[] {
  return incoming.map((item, index) => {
    const plain = withoutCostKeys(item);
    const before = stored[index];
    if (before?.description !== item.description || before.costUnitPaise === undefined) return plain;
    return {
      ...plain,
      costUnitPaise: before.costUnitPaise,
      ...(before.rateId === undefined ? {} : { rateId: before.rateId }),
    };
  });
}

/** A typed price clears a line's "needs a rate" marker; one still at zero keeps it. */
export function settledItems(items: readonly QuoteItem[]): QuoteItem[] {
  return items.map((item) => {
    if (item.needsRate !== true || item.unitPricePaise === 0) return item;
    const settled = { ...item };
    delete settled.needsRate;
    return settled;
  });
}
