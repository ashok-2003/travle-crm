// What pg-boss would keep of a failure: the message cut down as a failed job's error is, which platform staff can read.
import { sanitizeJobError } from "@travel-crm/integrations/jobs";

export const storedMessageOf = (error: unknown): string => sanitizeJobError(error).message;
