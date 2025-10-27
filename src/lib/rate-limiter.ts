// src/lib/rate-limiter.ts
import { isAllowed, record, RateLimitContext, RateLimitDecision } from '@/utils/rateLimiting';

export { isAllowed, record, RateLimitContext, RateLimitDecision };

// Export a default rate limiter instance for compatibility
export default {
  limit: async (ctx: RateLimitContext) => {
    const decision = isAllowed(ctx);
    if (decision.allowed) {
      record(ctx, decision);
    }
    return {
      success: decision.allowed,
      retryAfter: decision.retryAfter,
      remaining: decision.remaining,
      limit: decision.limit
    };
  },
  check: async (key: string) => {
    const ctx: RateLimitContext = {
      route: 'default',
      ip: key.split(':')[0],
      sessionId: key.split(':')[1]
    };
    const decision = isAllowed(ctx);
    return {
      success: decision.allowed,
      retryAfter: decision.retryAfter
    };
  }
};
