-- A generated departure remembers the day the schedule made it for, so a schedule change can tell it from one staff added.
ALTER TABLE "departure" ADD COLUMN "scheduled_on" DATE;
