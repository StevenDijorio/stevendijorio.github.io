// src/store/useAppStore.ts
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';

/**
 * ============================================================
 * Types
 * ============================================================
 */

export type ISODate = `${number}-${number}-${number}`;

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskValue {
  score: number;
  level: RiskLevel;
  updatedAt: number; // epoch ms
  reason?: string;
}

export interface AppState {
  /** ---- Session (ephemeral) ---- */
  sessionId: string; // random, anonymous, not persisted
  sessionCreatedAt: number; // epoch ms, not persisted

  /** ---- Streaming (ephemeral) ---- */
  isStreaming: boolean;
  streamId: string | null;

  /** ---- Text buffers (ephemeral, in-memory only) ---- */
  inputText: string;
  outputText: string;

  /** ---- Privacy ---- */
  privacyByDefault: boolean;

  /** ---- Credits & Gating ---- */
  paidCredits: number; // non-ad credits (persisted)
  adCredits: number; // ad-earned spendable credits (persisted)

  // Single source of truth for ad gating and cooldowns (persisted)
  adCooldownMs: number; // min time between ad credit earns
  lastAdCreditAt: number | null; // epoch ms of last earned ad credit
  adDailyCap: number; // max ad credits earnable per UTC day
  adEarnedToday: number; // count earned on ISO date below
  adEarnedTodayDate: ISODate; // ISO UTC date key, e.g., "2025-10-27"

  /** ---- Free rewrite quota (persisted metadata only) ---- */
  freeRewritesPerDay: number;
  freeRewritesUsedToday: number;
  freeRewritesResetAt: number; // epoch ms at next UTC midnight

  /** ---- Risk analysis cache (ephemeral) ---- */
  riskCache: Map<string, RiskValue>;
}

export interface AppActions {
  /** Text */
  setInputText: (text: string) => void;
  setOutputText: (text: string) => void;
  clearTexts: () => void;

  /** Streaming */
  startStreaming: (streamId?: string) => void;
  stopStreaming: () => void;
  setIsStreaming: (value: boolean) => void; // backward-compatible toggle

  /** Privacy */
  setPrivacyByDefault: (value: boolean) => void;

  /** Credits */
  addPaidCredits: (delta: number) => void;
  /** Earn a single ad credit if eligible by cooldown + daily cap. Returns true if earned. */
  earnAdCredit: (now?: number) => boolean;
  /** Spend 1 unit to perform a rewrite. Uses free quota first, then ad credits, then paid credits. Throws if none. */
  useOneRewrite: (now?: number) => void;

  /** Free quota helpers */
  getRemainingFreeRewrites: (now?: number) => number;

  /** Risk cache (ephemeral) */
  cacheRisk: (key: string, value: RiskValue) => void;
  getRisk: (key: string) => RiskValue | undefined;
  clearRiskCache: () => void;

  /** Session */
  newSession: () => void;

  /** Resets */
  resetEphemeral: () => void; // session, streaming, texts, risk cache
  resetPersisted: () => void; // persisted-only slice
  resetAll: () => void; // both

  /** INTERNAL: validate invariants for tests/debug */
  __validate: () => void;
}

/** The full store type, including persist helpers injected by middleware. */
export type AppStore = AppState & AppActions & {
  // Provided by `persist` middleware. Kept typed but optional to avoid TS friction.
  persist?: {
    clearStorage: () => void;
    rehydrate: () => Promise<void>;
    getOptions: () => unknown;
    setOptions: (o: unknown) => void;
  };
};

/**
 * ============================================================
 * Constants
 * ============================================================
 */

const STORE_KEY = 'app-store';
const MIGRATION_VERSION = 3 as const;

const DEFAULTS = {
  PRIVACY_BY_DEFAULT: true,
  FREE_REWRITES_PER_DAY: 3,
  AD_COOLDOWN_MS: 60_000, // 1 minute default
  AD_DAILY_CAP: 5,
} as const;

/**
 * ============================================================
 * Utilities
 * ============================================================
 */

export function invariant(condition: unknown, message = 'invariant failed'): asserts condition {
  if (!condition) throw new Error(message);
}

export { shallow as shallowEqual };

/** UTC yyyy-mm-dd */
function isoDateUTC(t: number): ISODate {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` as ISODate;
}

function nextUtcMidnight(t: number): number {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

function clampNonNegInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.floor(n);
  return v < 0 ? 0 : v;
}

function safeNow(now?: number): number {
  return typeof now === 'number' ? now : Date.now();
}

function randomId(length = 21): string {
  const g: any = globalThis as any;
  if (g?.crypto?.randomUUID) return g.crypto.randomUUID();
  const arr = g?.crypto?.getRandomValues ? new Uint8Array(length) : Array.from({ length }, () => Math.floor(Math.random() * 256));
  if (arr instanceof Uint8Array) g.crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => (b % 36).toString(36)).join('').slice(0, length);
}

/** Memory storage fallback for SSR/tests */
const memoryStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (name: string) => store[name] ?? null,
    setItem: (name: string, value: string) => { store[name] = value; },
    removeItem: (name: string) => { delete store[name]; },
  };
})();

/**
 * ============================================================
 * Initial State Factory (pure)
 * ============================================================
 */

export function createInitialState(now = safeNow()): AppState {
  const dateKey = isoDateUTC(now);
  return {
    /** Session */
    sessionId: randomId(),
    sessionCreatedAt: now,

    /** Streaming */
    isStreaming: false,
    streamId: null,

    /** Text buffers (in-memory only) */
    inputText: '',
    outputText: '',

    /** Privacy */
    privacyByDefault: DEFAULTS.PRIVACY_BY_DEFAULT,

    /** Credits */
    paidCredits: 0,
    adCredits: 0,
    adCooldownMs: DEFAULTS.AD_COOLDOWN_MS,
    lastAdCreditAt: null,
    adDailyCap: DEFAULTS.AD_DAILY_CAP,
    adEarnedToday: 0,
    adEarnedTodayDate: dateKey,

    /** Free quota */
    freeRewritesPerDay: DEFAULTS.FREE_REWRITES_PER_DAY,
    freeRewritesUsedToday: 0,
    freeRewritesResetAt: nextUtcMidnight(now),

    /** Risk cache */
    riskCache: new Map<string, RiskValue>(),
  };
}

/**
 * ============================================================
 * Derived helpers (pure)
 * ============================================================
 */

export function computeRemainingFreeRewrites(
  freePerDay: number,
  usedToday: number,
  now: number,
  resetAt: number
): number {
  // Do not mutate. If reset time passed, quota is considered reset for computation.
  const effectiveUsed = now >= resetAt ? 0 : usedToday;
  const remain = clampNonNegInt(freePerDay - effectiveUsed);
  return remain;
}

export function nextAdEligibleAt(lastAdCreditAt: number | null, cooldownMs: number): number {
  if (!lastAdCreditAt) return 0;
  return lastAdCreditAt + clampNonNegInt(cooldownMs);
}

export function isAdEarnEligible(
  now: number,
  lastAt: number | null,
  cooldownMs: number,
  dailyCap: number,
  earnedToday: number,
  earnedTodayDate: ISODate
): boolean {
  const todayKey = isoDateUTC(now);
  const todayEarned = todayKey === earnedTodayDate ? earnedToday : 0;
  if (todayEarned >= clampNonNegInt(dailyCap)) return false;
  const nextAt = nextAdEligibleAt(lastAt, cooldownMs);
  return now >= nextAt;
}

/**
 * ============================================================
 * Persist config: partialize + migrations
 * ============================================================
 */

type PersistedSlice = Pick<
  AppState,
  | 'privacyByDefault'
  | 'paidCredits'
  | 'adCredits'
  | 'adCooldownMs'
  | 'lastAdCreditAt'
  | 'adDailyCap'
  | 'adEarnedToday'
  | 'adEarnedTodayDate'
  | 'freeRewritesPerDay'
  | 'freeRewritesUsedToday'
  | 'freeRewritesResetAt'
>;

function partializeForPersist(state: AppState): PersistedSlice {
  // Store only non-sensitive fields. No text, no session, no risk cache, no streaming flags.
  return {
    privacyByDefault: state.privacyByDefault,
    paidCredits: state.paidCredits,
    adCredits: state.adCredits,
    adCooldownMs: state.adCooldownMs,
    lastAdCreditAt: state.lastAdCreditAt,
    adDailyCap: state.adDailyCap,
    adEarnedToday: state.adEarnedToday,
    adEarnedTodayDate: state.adEarnedTodayDate,
    freeRewritesPerDay: state.freeRewritesPerDay,
    freeRewritesUsedToday: state.freeRewritesUsedToday,
    freeRewritesResetAt: state.freeRewritesResetAt,
  };
}

function migratePersisted(
  persisted: any,
  fromVersion: number
): PersistedSlice {
  // Start from a safe baseline.
  const now = safeNow();
  const base = partializeForPersist(createInitialState(now));
  let s: any = { ...base, ...(persisted ?? {}) };

  if (fromVersion < 1) {
    // v0 -> v1: normalize fields; if legacy `credits` existed, treat as paidCredits
    if (typeof s.credits === 'number') {
      s.paidCredits = clampNonNegInt(s.credits);
      delete s.credits;
    }
    if (typeof s.adCreditCount === 'number') {
      s.adCredits = clampNonNegInt(s.adCreditCount);
      delete s.adCreditCount;
    }
  }

  if (fromVersion < 2) {
    // v1 -> v2: add ad gating fields if missing
    s.adCooldownMs = clampNonNegInt(Number(s.adCooldownMs ?? DEFAULTS.AD_COOLDOWN_MS));
    s.lastAdCreditAt = typeof s.lastAdCreditAt === 'number' ? s.lastAdCreditAt : null;
    s.adDailyCap = clampNonNegInt(Number(s.adDailyCap ?? DEFAULTS.AD_DAILY_CAP));
    s.adEarnedToday = clampNonNegInt(Number(s.adEarnedToday ?? 0));
    s.adEarnedTodayDate = (s.adEarnedTodayDate as ISODate) ?? isoDateUTC(now);
    s.adCredits = clampNonNegInt(Number(s.adCredits ?? 0));
  }

  if (fromVersion < 3) {
    // v2 -> v3: add free rewrite quota fields
    s.freeRewritesPerDay = clampNonNegInt(Number(s.freeRewritesPerDay ?? DEFAULTS.FREE_REWRITES_PER_DAY));
    s.freeRewritesUsedToday = clampNonNegInt(Number(s.freeRewritesUsedToday ?? 0));
    s.freeRewritesResetAt = Number.isFinite(s.freeRewritesResetAt) ? Number(s.freeRewritesResetAt) : nextUtcMidnight(now);
  }

  // Ensure privacy flag exists
  s.privacyByDefault = Boolean(s.privacyByDefault ?? DEFAULTS.PRIVACY_BY_DEFAULT);

  // Final clamp
  return {
    ...base,
    ...s,
    paidCredits: clampNonNegInt(s.paidCredits),
    adCredits: clampNonNegInt(s.adCredits),
    adCooldownMs: clampNonNegInt(s.adCooldownMs),
    lastAdCreditAt: s.lastAdCreditAt === null ? null : clampNonNegInt(s.lastAdCreditAt),
    adDailyCap: clampNonNegInt(s.adDailyCap),
    adEarnedToday: clampNonNegInt(s.adEarnedToday),
    adEarnedTodayDate: s.adEarnedTodayDate as ISODate,
    freeRewritesPerDay: clampNonNegInt(s.freeRewritesPerDay),
    freeRewritesUsedToday: clampNonNegInt(s.freeRewritesUsedToday),
    freeRewritesResetAt: clampNonNegInt(s.freeRewritesResetAt),
  };
}

/**
 * ============================================================
 * Store
 * ============================================================
 */

export const useAppStore = create<AppStore>()(
  subscribeWithSelector(
    persist<AppStore>(
      (set, get) => ({
        ...createInitialState(),

        /** Text */
        setInputText: (text) => set({ inputText: text }),
        setOutputText: (text) => set({ outputText: text }),
        clearTexts: () => set({ inputText: '', outputText: '' }),

        /** Streaming */
        startStreaming: (streamId) => set({ isStreaming: true, streamId: streamId ?? randomId(16) }),
        stopStreaming: () => set({ isStreaming: false, streamId: null }),
        setIsStreaming: (value) => set({ isStreaming: value }), // @deprecated prefer startStreaming/stopStreaming

        /** Privacy */
        setPrivacyByDefault: (value) => set({ privacyByDefault: Boolean(value) }),

        /** Credits */
        addPaidCredits: (delta) =>
          set((s) => {
            const add = clampNonNegInt(delta);
            const next = clampNonNegInt(s.paidCredits + add);
            return { paidCredits: next };
          }),

        earnAdCredit: (maybeNow) => {
          const now = safeNow(maybeNow);
          const s = get();
          const todayKey = isoDateUTC(now);
          const todayEarned = todayKey === s.adEarnedTodayDate ? s.adEarnedToday : 0;

          if (!isAdEarnEligible(now, s.lastAdCreditAt, s.adCooldownMs, s.adDailyCap, todayEarned, todayKey)) {
            return false;
          }

          set({
            adCredits: clampNonNegInt(s.adCredits + 1),
            lastAdCreditAt: now,
            adEarnedToday: clampNonNegInt(todayEarned + 1),
            adEarnedTodayDate: todayKey,
          });
          return true;
        },

        useOneRewrite: (maybeNow) => {
          const now = safeNow(maybeNow);
          const s = get();

          // Handle free quota rollover for usage decision (do not mutate until we spend)
          const remainingFree = computeRemainingFreeRewrites(
            s.freeRewritesPerDay,
            s.freeRewritesUsedToday,
            now,
            s.freeRewritesResetAt
          );

          if (remainingFree > 0) {
            // Spend free quota. If reset passed, reset counters first.
            set((curr) => {
              const reset = now >= curr.freeRewritesResetAt;
              const used = reset ? 0 : curr.freeRewritesUsedToday;
              return {
                freeRewritesUsedToday: clampNonNegInt(used + 1),
                freeRewritesResetAt: reset ? nextUtcMidnight(now) : curr.freeRewritesResetAt,
              };
            });
            return;
          }

          // Spend ad credits if available.
          if (s.adCredits > 0) {
            set({ adCredits: clampNonNegInt(s.adCredits - 1) });
            return;
          }

          // Spend paid credits if available.
          if (s.paidCredits > 0) {
            set({ paidCredits: clampNonNegInt(s.paidCredits - 1) });
            return;
          }

          invariant(false, 'No available credits or free quota to perform rewrite');
        },

        /** Free quota helpers */
        getRemainingFreeRewrites: (maybeNow) => {
          const now = safeNow(maybeNow);
          const s = get();
          return computeRemainingFreeRewrites(
            s.freeRewritesPerDay,
            s.freeRewritesUsedToday,
            now,
            s.freeRewritesResetAt
          );
        },

        /** Risk cache */
        cacheRisk: (key, value) =>
          set((s) => {
            const next = new Map(s.riskCache);
            next.set(key, { ...value });
            return { riskCache: next };
          }),
        getRisk: (key) => get().riskCache.get(key),
        clearRiskCache: () => set({ riskCache: new Map() }),

        /** Session */
        newSession: () =>
          set({
            sessionId: randomId(),
            sessionCreatedAt: safeNow(),
          }),

        /** Resets */
        resetEphemeral: () =>
          set((s) => ({
            sessionId: randomId(),
            sessionCreatedAt: safeNow(),
            isStreaming: false,
            streamId: null,
            inputText: '',
            outputText: '',
            riskCache: new Map(),
            // keep persisted slice intact
            privacyByDefault: s.privacyByDefault,
          })),
        resetPersisted: () => {
          const now = safeNow();
          const fresh = partializeForPersist(createInitialState(now));
          set(fresh);
          // best-effort clear persisted storage
          try {
            (get() as any).persist?.clearStorage?.();
            (get() as any).persist?.rehydrate?.();
          } catch {
            // ignore
          }
        },
        resetAll: () => {
          const now = safeNow();
          set(createInitialState(now));
          try {
            (get() as any).persist?.clearStorage?.();
            (get() as any).persist?.rehydrate?.();
          } catch {
            // ignore
          }
        },

        __validate: () => {
          const s = get();
          invariant(s.paidCredits >= 0, 'paidCredits must be >= 0');
          invariant(s.adCredits >= 0, 'adCredits must be >= 0');
          invariant(s.freeRewritesPerDay >= 0, 'freeRewritesPerDay must be >= 0');
          invariant(s.freeRewritesUsedToday >= 0, 'freeRewritesUsedToday must be >= 0');
          invariant(s.adDailyCap >= 0, 'adDailyCap must be >= 0');
          if (s.lastAdCreditAt !== null) invariant(s.lastAdCreditAt >= 0, 'lastAdCreditAt must be >= 0');
          invariant(typeof s.privacyByDefault === 'boolean', 'privacyByDefault must be boolean');
        },
      }),
      {
        name: STORE_KEY,
        version: MIGRATION_VERSION,
        storage: createJSONStorage(() => {
          if (typeof window === 'undefined' || !('localStorage' in window)) {
            return memoryStorage as any;
          }
          return window.localStorage;
        }),
        partialize: partializeForPersist as any,
        migrate: (persisted, fromVersion) => migratePersisted(persisted, fromVersion ?? 0),
        onRehydrateStorage: () => (state) => {
          // After hydration, ensure the store is valid
          try {
            state?.__validate();
          } catch {
            // If corrupted, reset persisted slice to defaults without touching ephemerals.
            const now = safeNow();
            const fresh = partializeForPersist(createInitialState(now));
            state?.resetPersisted();
            // Re-apply defaults
            (state as any)?.set?.(() => fresh);
          }
        },
      }
    )
  )
);

/**
 * ============================================================
 * Selectors (typed, exportable, stable)
 * Use with: const hasCredit = useAppStore(selectors.hasCredit);
 * ============================================================
 */

type Selector<T> = (s: AppStore) => T;

const _remainingFreeRewrites: Selector<number> = (s) =>
  computeRemainingFreeRewrites(s.freeRewritesPerDay, s.freeRewritesUsedToday, Date.now(), s.freeRewritesResetAt);

const _hasCredit: Selector<boolean> = (s) => s.paidCredits + s.adCredits > 0;

const _canRewrite: Selector<boolean> = (s) => {
  if (s.isStreaming) return false;
  if (_remainingFreeRewrites(s) > 0) return true;
  return _hasCredit(s);
};

const _isStreaming: Selector<boolean> = (s) => s.isStreaming;

const _adNextEligibleAt: Selector<number> = (s) => nextAdEligibleAt(s.lastAdCreditAt, s.adCooldownMs);

export const selectors = {
  remainingFreeRewrites: _remainingFreeRewrites,
  hasCredit: _hasCredit,
  canRewrite: _canRewrite,
  isStreaming: _isStreaming,
  adNextEligibleAt: _adNextEligibleAt,
} as const;

// Convenience typed selector exports
export const selectRemainingFreeRewrites = selectors.remainingFreeRewrites;
export const selectHasCredit = selectors.hasCredit;
export const selectCanRewrite = selectors.canRewrite;
export const selectIsStreaming = selectors.isStreaming;
export const selectAdNextEligibleAt = selectors.adNextEligibleAt;

/** Optional hooks for ergonomic usage */
export const useRemainingFreeRewrites = () => useAppStore(selectors.remainingFreeRewrites);
export const useHasCredit = () => useAppStore(selectors.hasCredit);
export const useCanRewrite = () => useAppStore(selectors.canRewrite);
export const useIsStreaming = () => useAppStore(selectors.isStreaming);

/**
 * ============================================================
 * Deprecated API aliases (kept for backward compatibility)
 * ============================================================
 */

// @deprecated Use addPaidCredits(+1)
export const addCredit = (n = 1) => useAppStore.getState().addPaidCredits(n);

// @deprecated Use earnAdCredit()
export const grantAdCredit = () => useAppStore.getState().earnAdCredit();

// @deprecated Use startStreaming()/stopStreaming()
export const setStreaming = (value: boolean) => useAppStore.getState().setIsStreaming(value);

// @deprecated Use setInputText()/setOutputText()
export const setInput = (text: string) => useAppStore.getState().setInputText(text);
export const setOutput = (text: string) => useAppStore.getState().setOutputText(text);