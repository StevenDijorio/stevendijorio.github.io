// src/lib/rate-limiter.ts
// Re-export runtime helpers and types from the rate limiting util.
// Note: The rewrite route currently disables rate limiting at call sites.

import { isAllowed, record } from '@/utils/rateLimiting';
import type { RateLimitContext, RateLimitDecision } from '@/utils/rateLimiting';

export { isAllowed, record };
export type { RateLimitContext, RateLimitDecision };
