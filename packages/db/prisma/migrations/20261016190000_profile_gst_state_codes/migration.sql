-- The profile's state must be one GST knows, not any two digits. The list is the kernel's gstStates (contracts
-- kernel/gst.ts); a domain test compares the two, so a state added there fails until a migration adds it here.
-- Hand-written: Prisma does not model CHECK constraints.
ALTER TABLE "organization_profile"
  DROP CONSTRAINT organization_profile_gst_state_code_format,
  ADD CONSTRAINT organization_profile_gst_state_code_known CHECK (gst_state_code IN ('01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '97'));
