-- Release 4: the agency's working hours, for the slow-reply clock. Additive: the days (bit 1 Monday to 64 Sunday),
-- and the opening and closing minute of the day in the organization's time zone. Default Monday to Saturday, 10:00 to 19:00.
ALTER TABLE "assignment_settings"
  ADD COLUMN "workdays" INTEGER NOT NULL DEFAULT 63,
  ADD COLUMN "day_opens_minute" INTEGER NOT NULL DEFAULT 600,
  ADD COLUMN "day_closes_minute" INTEGER NOT NULL DEFAULT 1140,
  ADD CONSTRAINT assignment_settings_workdays_range CHECK (workdays BETWEEN 0 AND 127),
  ADD CONSTRAINT assignment_settings_day_minutes CHECK (
    day_opens_minute BETWEEN 0 AND 1440 AND day_closes_minute BETWEEN 0 AND 1440 AND day_opens_minute < day_closes_minute
  );

-- Why an automatically assigned lead went to its owner, on the lead's "created" timeline entry (spec 4.7): the reason,
-- the rule's place when a rule chose it, and whether the person was away. Ids and fixed words only.
ALTER TABLE "lead_timeline_entry"
  ADD COLUMN "assignment_reason" TEXT,
  ADD COLUMN "assignment_rule_position" INTEGER,
  ADD COLUMN "assignment_away" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT lead_timeline_entry_assignment_reason_value CHECK (
    assignment_reason IS NULL OR assignment_reason IN ('returning', 'rule', 'turns', 'fewest_open', 'owner', 'none')
  ),
  ADD CONSTRAINT lead_timeline_entry_assignment_rule_position CHECK (assignment_rule_position IS NULL OR assignment_rule_position >= 0);
