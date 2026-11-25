-- A group trip's "From" price is worked out from its departures, so choosing to show it needs no typed amount: the rule
-- that "from" needs a typed price now holds for custom trips only. It only loosens a check (safe before the release deploys).
ALTER TABLE "quote_template" DROP CONSTRAINT quote_template_from_price_shown;
ALTER TABLE "quote_template"
  ADD CONSTRAINT quote_template_from_price_shown CHECK (price_display <> 'from' OR from_price_paise IS NOT NULL OR kind = 'group');
