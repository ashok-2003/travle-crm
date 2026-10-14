// How failed jobs are retried (spec 9.1): exponential backoff, then the failed-jobs list.

export interface RetryPolicy {
  /** Retries after the first attempt fails. */
  retryLimit: number;
  /** Seconds before the first retry; each later retry waits about twice as long. */
  retryDelaySeconds: number;
  /** The longest wait between two attempts, in seconds. */
  retryDelayMaxSeconds: number;
}

/** Five retries over about five minutes (10 s, 20 s, 40 s, 80 s, 160 s, with jitter), never more than an hour apart. */
export const defaultRetryPolicy: RetryPolicy = {
  retryLimit: 5,
  retryDelaySeconds: 10,
  retryDelayMaxSeconds: 60 * 60,
};
