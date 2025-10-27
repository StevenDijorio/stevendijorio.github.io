// src/lib/ratelimit.ts
// Minimal no-op ratelimit module to satisfy imports used by metrics route.
// Always allows, returns shape similar to common limiters.

export const ratelimit = {
  async limit(_key: string) {
    return { success: true, remaining: 999999, reset: Math.ceil(Date.now() / 1000) + 60 };
  },
};

export default ratelimit;


