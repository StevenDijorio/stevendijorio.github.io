// src/utils/rateLimiting.ts
import { createHash } from 'crypto';

/**
 * Sliding window + token bucket limiter with simple abuse heuristics.
 * Composite key: hashed ip + session id + route.
 * In-memory map with TTL and size cap. Evicts oldest. No global timers.
 */

/* =========================
 * Types
 * ========================= */

export type AbuseReason =
  | 'ok'
  | 'rate_limited'
  | 'duplicate_burst'
  | 'rapid_retries'
  | 'multi_tab_spike';

export interface RateLimitDecision {
  allowed: boolean;
  reason: AbuseReason;
  retryAfter: number; // seconds
  key: string; // composite hashed key
  remaining?: number; // approximate remaining in sliding window
  limit?: number; // sliding window cap
}

export interface RateLimitContext {
  route: string;
  ip?: string | null;
  sessionId?: string | null;
  /** Optional text payload to detect duplicate bursts. */
  content?: string;
  /** Optional opaque fingerprint if you do not want to pass raw content. */
  contentFingerprint?: string;
  /** Optional timestamp override (ms). Defaults to Date.now(). */
  nowMs?: number;
}

export interface RouteRateConfig {
  sliding: {
    windowMs: number; // size of window
    max: number; // max requests in window
  };
  bucket: {
    capacity: number; // max tokens
    refillPerSecond: number; // tokens per second
  };
  heuristics: {
    /** Count of identical payloads within this window triggers duplicate_burst. */
    duplicateWindowMs: number;
    duplicateThreshold: number;
    /** New attempts within this window after a denial trigger rapid_retries. */
    rapidRetryMs: number;
    /** Too many attempts in a tiny window triggers multi_tab_spike. */
    spikeWindowMs: number;
    spikeThreshold: number;
  };
}

export interface RateLimiterConfig {
  defaults: RouteRateConfig;
  routes?: Record<string, Partial<RouteRateConfig>>;
  store: {
    /** Maximum number of distinct composite keys to retain. */
    maxEntries: number;
    /** Idle TTL. State evicted if not touched within this window. */
    idleTtlMs: number;
    /** Sweep at most once per this interval. */
    minSweepIntervalMs: number;
  };
}

interface Attempt {
  t: number; // timestamp ms
  h?: string; // content hash (short)
}

interface State {
  key: string;
  route: string;

  // Token bucket
  tokens: number;
  lastRefill: number;

  // Sliding window
  attempts: Attempt[]; // all attempts recorded (allowed or denied if caller records those)

  // Duplicate detection
  contentHistory: Attempt[]; // subset with hashes

  // Bookkeeping
  lastSeen: number;
  expiresAt: number;

  // Heuristics memory
  lastDeniedAt?: number; // when a denial happened
}

/* =========================
 * Defaults
 * ========================= */

const DEFAULTS: RateLimiterConfig = {
  defaults: {
    sliding: { windowMs: 60_000, max: 60 }, // 60 req/min
    bucket: { capacity: 30, refillPerSecond: 10 }, // burst 30, 10 r/s
    heuristics: {
      duplicateWindowMs: 10_000,
      duplicateThreshold: 4, // 4 identical within 10s
      rapidRetryMs: 3_000,
      spikeWindowMs: 250,
      spikeThreshold: 8, // 8 attempts within 250ms
    },
  },
  routes: {},
  store: {
    maxEntries: 10_000,
    idleTtlMs: 15 * 60_000,
    minSweepIntervalMs: 10_000,
  },
};

/* =========================
 * Helpers
 * ========================= */

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function compositeKey(ip: string | null | undefined, sessionId: string | null | undefined, route: string): string {
  const ipPart = ip ?? '';
  const sessPart = sessionId ?? '';
  const raw = `${ipPart}|${sessPart}|${route}`;
  return shortHash(raw);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b);
}

function secs(ms: number): number {
  return Math.ceil(ms / 1000);
}

function nowMsOverride(n?: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : Date.now();
}

function mergeRouteConfig(base: RouteRateConfig, override?: Partial<RouteRateConfig>): RouteRateConfig {
  if (!override) return base;
  const merged: RouteRateConfig = {
    sliding: {
      windowMs: override.sliding?.windowMs ?? base.sliding.windowMs,
      max: override.sliding?.max ?? base.sliding.max,
    },
    bucket: {
      capacity: override.bucket?.capacity ?? base.bucket.capacity,
      refillPerSecond: override.bucket?.refillPerSecond ?? base.bucket.refillPerSecond,
    },
    heuristics: {
      duplicateWindowMs: override.heuristics?.duplicateWindowMs ?? base.heuristics.duplicateWindowMs,
      duplicateThreshold: override.heuristics?.duplicateThreshold ?? base.heuristics.duplicateThreshold,
      rapidRetryMs: override.heuristics?.rapidRetryMs ?? base.heuristics.rapidRetryMs,
      spikeWindowMs: override.heuristics?.spikeWindowMs ?? base.heuristics.spikeWindowMs,
      spikeThreshold: override.heuristics?.spikeThreshold ?? base.heuristics.spikeThreshold,
    },
  };
  // sanity
  merged.sliding.windowMs = Math.max(1000, merged.sliding.windowMs);
  merged.sliding.max = Math.max(1, merged.sliding.max);
  merged.bucket.capacity = Math.max(1, merged.bucket.capacity);
  merged.bucket.refillPerSecond = Math.max(0.1, merged.bucket.refillPerSecond);
  merged.heuristics.duplicateWindowMs = Math.max(1000, merged.heuristics.duplicateWindowMs);
  merged.heuristics.duplicateThreshold = Math.max(2, merged.heuristics.duplicateThreshold);
  merged.heuristics.rapidRetryMs = Math.max(250, merged.heuristics.rapidRetryMs);
  merged.heuristics.spikeWindowMs = Math.max(50, merged.heuristics.spikeWindowMs);
  merged.heuristics.spikeThreshold = Math.max(3, merged.heuristics.spikeThreshold);
  return merged;
}

/* =========================
 * Core
 * ========================= */

class InMemoryStore {
  private map = new Map<string, State>();
  private lastSweep = 0;

  constructor(private opts: RateLimiterConfig['store']) {}

  get size(): number {
    return this.map.size;
  }

  getOrCreate(key: string, route: string, now: number, routeCfg: RouteRateConfig): State {
    let s = this.map.get(key);
    if (!s) {
      // Evict if needed before creating
      if (this.map.size >= this.opts.maxEntries) this.evictOldest();
      s = {
        key,
        route,
        tokens: routeCfg.bucket.capacity,
        lastRefill: now,
        attempts: [],
        contentHistory: [],
        lastSeen: now,
        expiresAt: now + this.opts.idleTtlMs,
      };
      this.map.set(key, s);
    } else {
      s.lastSeen = now;
      s.expiresAt = now + this.opts.idleTtlMs;
    }
    this.sweepIfNeeded(now);
    return s;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestSeen = Infinity;
    for (const [k, v] of this.map) {
      if (v.lastSeen < oldestSeen) {
        oldestSeen = v.lastSeen;
        oldestKey = k;
      }
    }
    if (oldestKey) this.map.delete(oldestKey);
  }

  private sweepIfNeeded(now: number): void {
    if (now - this.lastSweep < this.opts.minSweepIntervalMs) return;
    this.lastSweep = now;
    const toDelete: string[] = [];
    for (const [k, v] of this.map) {
      if (v.expiresAt <= now) toDelete.push(k);
    }
    for (const k of toDelete) this.map.delete(k);
  }
}

export class RateLimiter {
  private cfg: RateLimiterConfig;
  private store: InMemoryStore;

  constructor(cfg?: Partial<RateLimiterConfig>) {
    this.cfg = {
      defaults: cfg?.defaults ? mergeRouteConfig(DEFAULTS.defaults, cfg.defaults) : DEFAULTS.defaults,
      routes: cfg?.routes ?? DEFAULTS.routes,
      store: { ...DEFAULTS.store, ...(cfg?.store ?? {}) },
    };
    this.store = new InMemoryStore(this.cfg.store);
  }

  public configureRoute(route: string, overrides: Partial<RouteRateConfig>): void {
    if (!this.cfg.routes) this.cfg.routes = {};
    this.cfg.routes[route] = { ...(this.cfg.routes[route] ?? {}), ...overrides };
  }

  private routeConfig(route: string): RouteRateConfig {
    return mergeRouteConfig(this.cfg.defaults, this.cfg.routes?.[route]);
  }

  private static contentSig(ctx: RateLimitContext): string | undefined {
    if (ctx.contentFingerprint) return ctx.contentFingerprint;
    if (ctx.content && ctx.content.length > 0) {
      const trimmed = ctx.content.length > 10_000 ? ctx.content.slice(0, 10_000) : ctx.content;
      return shortHash(trimmed);
    }
    return undefined;
  }

  private static refillTokens(s: State, now: number, cfg: RouteRateConfig): number {
    if (now <= s.lastRefill) return s.tokens;
    const deltaMs = now - s.lastRefill;
    const add = (deltaMs / 1000) * cfg.bucket.refillPerSecond;
    s.tokens = Math.min(cfg.bucket.capacity, s.tokens + add);
    s.lastRefill = now;
    return s.tokens;
  }

  private static pruneWindow(s: State, now: number, cfg: RouteRateConfig): void {
    const cutoff = now - cfg.sliding.windowMs;
    while (s.attempts.length && s.attempts[0].t <= cutoff) s.attempts.shift();
  }

  private static pruneContentHistory(s: State, now: number, cfg: RouteRateConfig): void {
    const cutoff = now - cfg.heuristics.duplicateWindowMs;
    while (s.contentHistory.length && s.contentHistory[0].t <= cutoff) s.contentHistory.shift();
    // Keep the arrays bounded defensively
    if (s.contentHistory.length > 1000) s.contentHistory.splice(0, s.contentHistory.length - 1000);
  }

  private static countRecentAttempts(s: State, windowMs: number, now: number): number {
    const cutoff = now - windowMs;
    // attempts is already pruned at sliding window scale, but spike window can be smaller
    let i = s.attempts.length - 1;
    let count = 0;
    for (; i >= 0; i--) {
      if (s.attempts[i].t >= cutoff) count++;
      else break;
    }
    return count;
  }

  private static countDuplicate(s: State, hash: string | undefined, now: number, windowMs: number): { count: number; earliestTs?: number } {
    if (!hash) return { count: 0 };
    const cutoff = now - windowMs;
    let count = 0;
    let earliestTs: number | undefined;
    for (let i = s.contentHistory.length - 1; i >= 0; i--) {
      const e = s.contentHistory[i];
      if (e.t < cutoff) break;
      if (e.h === hash) {
        count++;
        earliestTs = e.t;
      }
    }
    return { count, earliestTs };
  }

  /**
   * Checks if a request is allowed right now. Might update denial memory to detect rapid retries.
   * Does not mutate sliding window or consume tokens when allowed.
   */
  public isAllowed(ctx: RateLimitContext): RateLimitDecision {
    const now = nowMsOverride(ctx.nowMs);
    const routeCfg = this.routeConfig(ctx.route);
    const key = compositeKey(ctx.ip, ctx.sessionId, ctx.route);
    const s = this.store.getOrCreate(key, ctx.route, now, routeCfg);

    // Maintenance
    RateLimiter.pruneWindow(s, now, routeCfg);
    RateLimiter.pruneContentHistory(s, now, routeCfg);
    RateLimiter.refillTokens(s, now, routeCfg);

    // Heuristics
    const sig = RateLimiter.contentSig(ctx);
    const dup = RateLimiter.countDuplicate(s, sig, now, routeCfg.heuristics.duplicateWindowMs);
    const spikeCount = RateLimiter.countRecentAttempts(s, routeCfg.heuristics.spikeWindowMs, now);
    const rapidRetry = s.lastDeniedAt ? now - s.lastDeniedAt < routeCfg.heuristics.rapidRetryMs : false;

    const heuristicsTriggered: AbuseReason[] = [];
    const retryCandidates: number[] = [];

    if (dup.count >= routeCfg.heuristics.duplicateThreshold) {
      heuristicsTriggered.push('duplicate_burst');
      if (dup.earliestTs) retryCandidates.push(routeCfg.heuristics.duplicateWindowMs - (now - dup.earliestTs));
    }
    if (rapidRetry) {
      heuristicsTriggered.push('rapid_retries');
      retryCandidates.push(routeCfg.heuristics.rapidRetryMs - (now - (s.lastDeniedAt ?? now)));
    }
    if (spikeCount >= routeCfg.heuristics.spikeThreshold) {
      heuristicsTriggered.push('multi_tab_spike');
      // estimate next allowance when spike window passes
      const earliestSpikeWindow = now - routeCfg.heuristics.spikeWindowMs;
      // Next request likely allowed when one of those attempts ages out
      retryCandidates.push(routeCfg.heuristics.spikeWindowMs);
      // coarse upper bound included; exact earliest event time requires scanning, cost avoided
    }

    // Capacity checks
    const windowCount = s.attempts.length;
    const windowLimitHit = windowCount >= routeCfg.sliding.max;
    if (windowLimitHit) {
      const earliest = s.attempts[0]?.t ?? now;
      const ms = routeCfg.sliding.windowMs - (now - earliest);
      retryCandidates.push(ms);
    }

    const tokensAfterRefill = s.tokens;
    const tokenLimitHit = tokensAfterRefill < 1;
    if (tokenLimitHit) {
      const deficit = 1 - tokensAfterRefill;
      const ms = (deficit / routeCfg.bucket.refillPerSecond) * 1000;
      retryCandidates.push(ms);
    }

    let reason: AbuseReason = 'ok';
    let allowed = true;

    if (heuristicsTriggered.length > 0) {
      // Prefer heuristic reasons over generic rate_limited
      reason = heuristicsTriggered[0];
      allowed = false;
    } else if (windowLimitHit || tokenLimitHit) {
      reason = 'rate_limited';
      allowed = false;
    }

    const retryAfter = allowed ? 0 : Math.max(1, secs(Math.max(0, ...retryCandidates)));

    // Update denial memory for rapid retries
    if (!allowed) s.lastDeniedAt = now;

    const remainingApprox = clamp(routeCfg.sliding.max - windowCount, 0, routeCfg.sliding.max);

    return {
      allowed,
      reason,
      retryAfter,
      key,
      remaining: remainingApprox,
      limit: routeCfg.sliding.max,
    };
  }

  /**
   * Record an attempt result. Call this after isAllowed().
   * When allowed, consumes 1 token and appends to windows and content history.
   * When denied, only denial memory and attempts list are updated.
   */
  public record(ctx: RateLimitContext, decision: RateLimitDecision): {
    key: string;
    route: string;
    tokens: number;
    windowCount: number;
    expiresAt: number;
  } {
    const now = nowMsOverride(ctx.nowMs);
    const routeCfg = this.routeConfig(ctx.route);
    const key = compositeKey(ctx.ip, ctx.sessionId, ctx.route);
    const s = this.store.getOrCreate(key, ctx.route, now, routeCfg);

    // Maintenance
    RateLimiter.pruneWindow(s, now, routeCfg);
    RateLimiter.pruneContentHistory(s, now, routeCfg);
    RateLimiter.refillTokens(s, now, routeCfg);

    // Always record attempt timestamp to help detect multi-tab spikes next time.
    const sig = RateLimiter.contentSig(ctx);
    const attempt: Attempt = { t: now, h: sig };
    s.attempts.push(attempt);

    if (decision.allowed) {
      // Consume one token and record content hash
      s.tokens = Math.max(0, s.tokens - 1);
      if (sig) s.contentHistory.push({ t: now, h: sig });
    } else {
      s.lastDeniedAt = now;
    }

    // Bound attempts array. Keep only what's needed for accuracy.
    const slidingCutoff = now - routeCfg.sliding.windowMs;
    while (s.attempts.length && s.attempts[0].t <= slidingCutoff) s.attempts.shift();
    if (s.attempts.length > 2000) s.attempts.splice(0, s.attempts.length - 2000);

    return {
      key,
      route: ctx.route,
      tokens: Math.floor(s.tokens),
      windowCount: s.attempts.length,
      expiresAt: s.expiresAt,
    };
  }
}

/* =========================
 * Singleton + Exports
 * ========================= */

const rateLimiterSingleton = new RateLimiter();

export const isAllowed = (ctx: RateLimitContext) => rateLimiterSingleton.isAllowed(ctx);
export const record = (
  ctx: RateLimitContext,
  decision: RateLimitDecision,
) => rateLimiterSingleton.record(ctx, decision);

export default rateLimiterSingleton;