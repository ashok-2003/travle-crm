// Public API of the rate-limits module: limits on the public routes that hold across api instances (spec 9.7).
export { createRateLimiter, type RateLimiter, type RateLimitResult, type RateLimitRule } from "./rate-limiter.js";
