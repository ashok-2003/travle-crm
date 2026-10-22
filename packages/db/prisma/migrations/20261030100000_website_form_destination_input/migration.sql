-- AlterTable
ALTER TABLE "website_form" ADD COLUMN "destination_input" TEXT NOT NULL DEFAULT 'list';

-- How the Destination question appears: the agency's list, or a box the visitor types in.
ALTER TABLE "website_form"
  ADD CONSTRAINT website_form_destination_input_value CHECK (destination_input IN ('list', 'typed'));
