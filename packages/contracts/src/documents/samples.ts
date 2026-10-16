// How many branding samples an organization may issue (spec 9.3): each is kept for good with its PDF, so the api
// refuses past it (SAMPLE_LIMIT_REACHED), and that refusal's sentence states the figure.

/** Samples an organization may issue in any 24 hours: plenty for trying colours and logos. */
export const SAMPLES_PER_DAY = 50;
