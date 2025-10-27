"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  memo,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
} from "react";
import { usePathname, useRouter } from "next/navigation";

/** ================================
 *  i18n shim
 *  ================================ */
const translations: Record<string, string> = {};
const t = (key: string) => translations[key] ?? key;

/** ================================
 *  Types
 *  ================================ */
type Severity = "low" | "medium" | "high";
type RiskItem = { id: string; label: string; severity: Severity; range?: [number, number] };
type RiskAnalysis = { score: number; issues: RiskItem[] };

type StreamStatus = "idle" | "streaming" | "done" | "error" | "cancelled";
type RewriteState = {
  input: string;
  output: string;
  partial: string;
  status: StreamStatus;
  tokensIn: number;
  tokensOut: number;
  errorCode?: number;
  errorMessage?: string;
  startedAt?: number;
  finishedAt?: number;
};

type MetricEventType = "start" | "complete" | "error" | "ad-credit-used" | "tokens";
type MetricEvent = { id: string; ts: number; type: MetricEventType; meta?: Record<string, unknown> };

type AppState = {
  credits: number;
  cooldownEndsAt: number | null;
  freeQuotaRemaining: number;
  metrics: MetricEvent[];
};

type Toast = { id: string; title: string; message: string; kind: "info" | "error" | "success"; ttlMs: number };

/** ================================
 *  Utilities
 *  ================================ */
const now = () => Date.now();
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");
const uuid = () => Math.random().toString(36).slice(2);
const formatMs = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
};
const estimateTokens = (text: string) => {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 1.3));
};
const fireAndForget = (endpoint: string, payload: unknown) => {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      (navigator as any).sendBeacon(endpoint, blob);
    } else {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        cache: "no-store",
      }).catch(() => void 0);
    }
  } catch {
    // swallow by design
  }
};

/** ================================
 *  Minimal in-file store with memoized selectors
 *  ================================ */
const createStore = () => {
  let state: AppState = {
    credits: 1,
    cooldownEndsAt: null,
    freeQuotaRemaining: 3,
    metrics: [],
  };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set: (partial: Partial<AppState>) => {
      state = { ...state, ...partial };
      listeners.forEach((l) => l());
    },
    addMetric: (ev: MetricEvent) => {
      state = { ...state, metrics: [ev, ...state.metrics] };
      listeners.forEach((l) => l());
      fireAndForget("/api/metrics", ev);
    },
    decCredits: (n = 1) => {
      state = { ...state, credits: clamp(state.credits - n, 0, 999) };
      listeners.forEach((l) => l());
    },
    incCredits: (n = 1) => {
      state = { ...state, credits: clamp(state.credits + n, 0, 999) };
      listeners.forEach((l) => l());
    },
    decFreeQuota: (n = 1) => {
      state = { ...state, freeQuotaRemaining: clamp(state.freeQuotaRemaining - n, 0, 999) };
      listeners.forEach((l) => l());
    },
  };
};
const store = createStore();

// selectors
const selectCredits = (s: AppState) => s.credits;
const selectCooldownEndsAt = (s: AppState) => s.cooldownEndsAt;
const selectFreeQuota = (s: AppState) => s.freeQuotaRemaining;
const selectMetrics = (s: AppState) => s.metrics;

function useStoreSelector<T>(selector: (s: AppState) => T, equals: (a: T, b: T) => boolean = Object.is): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const getSnapshot = useCallback(() => selectorRef.current(store.get()), []);
  const [snap, setSnap] = useState<T>(getSnapshot);
  useEffect(() => store.subscribe(() => setSnap(getSnapshot())), [getSnapshot]);
  const stable = useMemo(() => snap, [snap]); // prevent unnecessary rerenders
  return stable;
}

/** ================================
 *  Hooks
 *  ================================ */

/** Toasts */
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = uuid();
    const full: Toast = { id, ...toast };
    setToasts((t) => [...t, full]);
    const ttl = toast.ttlMs ?? 5000;
    const timer = setTimeout(() => remove(id), ttl);
    return () => clearTimeout(timer);
  }, [remove]);
  return { toasts, push, remove };
}

/** Ad gate */
function useAdGate() {
  const credits = useStoreSelector(selectCredits);
  const cooldownEndsAt = useStoreSelector(selectCooldownEndsAt);
  const freeQuotaRemaining = useStoreSelector(selectFreeQuota);
  const [nowTick, setNowTick] = useState(now());
  useEffect(() => {
    const i = setInterval(() => setNowTick(now()), 1000);
    return () => clearInterval(i);
  }, []);
  const cooldownMs = useMemo(
    () => (cooldownEndsAt ? Math.max(0, cooldownEndsAt - nowTick) : 0),
    [cooldownEndsAt, nowTick]
  );
  const canWatchAd = cooldownMs === 0;
  const canRewrite = credits > 0;
  const watchAd = useCallback(() => {
    if (!canWatchAd) return;
    const COOLDOWN = 30_000; // 30s example cooldown; respects "ad gate UX"
    store.set({ cooldownEndsAt: now() + COOLDOWN });
    // Simulate ad credit arrival after 5 seconds
    setTimeout(() => {
      store.incCredits(1);
      store.addMetric({ id: uuid(), ts: now(), type: "ad-credit-used", meta: { source: "ad", amount: 1 } });
    }, 5000);
  }, [canWatchAd]);
  return { credits, canRewrite, freeQuotaRemaining, cooldownMs, canWatchAd, watchAd };
}

/** Risk analysis (debounced) */
function useRiskAnalysis(input: string) {
  const [analysis, setAnalysis] = useState<RiskAnalysis>({ score: 0, issues: [] });
  const [ready, setReady] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    const id = setTimeout(() => {
      // local heuristic analysis, privacy by default
      const issues: RiskItem[] = [];
      const lower = input.toLowerCase();
      if (lower.includes("password") || lower.includes("ssn")) {
        issues.push({ id: "pii", label: t("Personal data detected"), severity: "high" });
      }
      if (lower.length > 4000) {
        issues.push({ id: "length", label: t("Very long input"), severity: "medium" });
      }
      if (/\b\d{16}\b/.test(lower.replace(/\s+/g, ""))) {
        issues.push({ id: "cc", label: t("Payment-like numbers"), severity: "high" });
      }
      const score = clamp(issues.reduce((acc, it) => acc + (it.severity === "high" ? 60 : it.severity === "medium" ? 25 : 10), 0), 0, 100);
      if (!controller.signal.aborted) {
        setAnalysis({ score, issues });
        setReady(true);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(id);
    };
  }, [input]);
  return { analysis, ready };
}

/** Focus trap for sidebars */
function useFocusTrap(enabled: boolean, ref: MutableRefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const node = ref.current;
    const getEls = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = getEls();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (active === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [enabled, ref]);
}

/** Streamed rewrite with retry, partial surfacing, and route-change cancel */
function useStreamedRewrite(pushToast: ReturnType<typeof useToasts>["push"]) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<RewriteState>({
    input: "",
    output: "",
    partial: "",
    status: "idle",
    tokensIn: 0,
    tokensOut: 0,
  });
  const [isPending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // cancel on route change
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    // if path changes, cancel any in-flight
    if (abortRef.current) abortRef.current.abort();
  }, [pathname]);

  const backoff = (attempt: number) =>
    new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt + Math.floor(Math.random() * 200))));

  const fetchWithRetryStream = useCallback(
    async (
      endpoint: string,
      body: { input: string },
      onChunk: (text: string) => void,
      onStatus?: (code: number) => void
    ) => {
      let attempt = 0;
      let lastStatus = 0;
      while (attempt < 4) {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
            cache: "no-store",
          });
          lastStatus = res.status;
          onStatus?.(res.status);
          if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
            attempt++;
            await backoff(attempt);
            continue;
          }
          if (!res.ok || !res.body) {
            const text = await res.text().catch(() => "");
            throw Object.assign(new Error(text || `HTTP ${res.status}`), { status: res.status });
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            onChunk(chunk);
          }
          return { ok: true, status: res.status };
        } catch (e: any) {
          if (controller.signal.aborted) {
            return { ok: false, status: 0, aborted: true };
          }
          attempt++;
          if (attempt >= 4) {
            return { ok: false, status: (e && e.status) || lastStatus || 0, error: e };
          }
          await backoff(attempt);
        }
      }
      return { ok: false, status: lastStatus };
    },
    []
  );

  const startRewrite = useCallback(
    (inputText: string) => {
      startTransition(() => {
        setState((s) => ({
          ...s,
          input: inputText,
          output: "",
          partial: "",
          status: "streaming",
          tokensIn: estimateTokens(inputText),
          errorCode: undefined,
          errorMessage: undefined,
          startedAt: now(),
          finishedAt: undefined,
        }));

        const startEvent: MetricEvent = { id: uuid(), ts: now(), type: "start", meta: { kind: "rewrite" } };
        store.addMetric(startEvent);

        // decrement credit immediately to prevent double-spend
        store.decCredits(1);
        store.decFreeQuota(1);
        store.addMetric({ id: uuid(), ts: now(), type: "ad-credit-used", meta: { consumed: 1 } });

        void fetchWithRetryStream(
          "/api/rewrite?stream=1",
          { input: inputText },
          (chunk) => {
            // Support either raw text chunks or SSE "data:" lines
            const parts = chunk
              .split("\n")
              .map((l) => (l.startsWith("data:") ? l.slice(5).trimStart() : l))
              .join("");
            setState((s) => {
              const partial = s.partial + parts;
              return { ...s, partial };
            });
          },
          (code) => {
            // no-op; could observe status
            (void code);
          }
        ).then((result) => {
          if (result?.ok) {
            setState((s) => {
              const output = s.partial;
              const doneAt = now();
              const outTokens = estimateTokens(output);
              store.addMetric({ id: uuid(), ts: doneAt, type: "tokens", meta: { in: s.tokensIn, out: outTokens } });
              store.addMetric({ id: uuid(), ts: doneAt, type: "complete", meta: { kind: "rewrite" } });
              return { ...s, output, status: "done", tokensOut: outTokens, finishedAt: doneAt };
            });
          } else if ((result as any)?.aborted) {
            setState((s) => ({ ...s, status: "cancelled", finishedAt: now() }));
            pushToast({ title: t("Cancelled"), message: t("Rewrite cancelled"), kind: "info", ttlMs: 3000 });
          } else {
            const code = (result as any)?.status || 0;
            const message = mapHttpError(code);
            setState((s) => ({ ...s, status: "error", errorCode: code, errorMessage: message, finishedAt: now() }));
            pushToast({ title: t("Error"), message, kind: "error", ttlMs: 6000 });
            store.addMetric({ id: uuid(), ts: now(), type: "error", meta: { code, message } });
          }
        });
      });
    },
    [fetchWithRetryStream, pushToast]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // keyboard shortcuts: Ctrl/Cmd+Enter to send
  const onKeyDownSend = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const text = (e.target as HTMLTextAreaElement | HTMLInputElement)?.value ?? state.input;
        if (text.trim()) startRewrite(text.trim());
      }
    },
    [startRewrite, state.input]
  );

  return { state, startRewrite, cancel, isPending, onKeyDownSend };
}

/** ================================
 *  Error mapping
 *  ================================ */
function mapHttpError(code: number): string {
  if (code === 0) return t("Network error. Check your connection and try again.");
  if (code === 400) return t("Invalid request. Adjust input and retry.");
  if (code === 401) return t("Unauthorized. Sign in again.");
  if (code === 402) return t("Out of credits. Earn a free credit by watching an ad.");
  if (code === 403) return t("Forbidden. Your account cannot use this feature.");
  if (code === 404) return t("Service unavailable. Try later.");
  if (code === 409) return t("Conflict. Please retry.");
  if (code === 413) return t("Input too large. Shorten text.");
  if (code === 429) return t("Rate limit. Please wait a bit and retry.");
  if (code >= 500 && code <= 599) return t("Server error. Retrying might help.");
  return t("Unexpected error. Try again.");
}

/** ================================
 *  Error Boundary
 *  ================================ */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    fireAndForget("/api/metrics", { type: "error", ts: now(), meta: { boundary: true, message: String(error) } });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="p-4 border rounded bg-red-50 text-red-800">
          <h2 className="font-semibold">{t("Something went wrong.")}</h2>
          <p>{t("Reload the page and try again.")}</p>
        </div>
      );
    }
    return this.props.children as any;
  }
}

/** ================================
 *  UI: Tooltip
 *  ================================ */
const Tooltip = memo(function Tooltip({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const onEnter = useCallback(() => setOpen(true), []);
  const onLeave = useCallback(() => setOpen(false), []);
  const onFocus = useCallback(() => setOpen(true), []);
  const onBlur = useCallback(() => setOpen(false), []);
  return (
    <span className="relative inline-flex" onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onFocus} onBlur={onBlur}>
      {React.cloneElement(children, { "aria-describedby": id })}
      <span
        id={id}
        role="tooltip"
        className={cx(
          "absolute z-10 -translate-y-full px-2 py-1 text-xs rounded border bg-white shadow",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        style={{ top: 0, left: "50%", transform: "translate(-50%, -6px)" }}
      >
        {label}
        <span
          aria-hidden="true"
          className="absolute w-2 h-2 border-l border-t bg-white"
          style={{ bottom: "-4px", left: "50%", transform: "translateX(-50%) rotate(45deg)" }}
        />
      </span>
    </span>
  );
});

/** ================================
 *  UI: Virtualized list
 *  ================================ */
const VirtualList = memo(function VirtualList<T>({
  items,
  itemHeight,
  height,
  overscan = 5,
  renderItem,
  ariaLabel,
}: {
  items: readonly T[];
  itemHeight: number;
  height: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = useCallback(() => setScrollTop(containerRef.current?.scrollTop || 0), []);
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length - 1, Math.ceil((scrollTop + height) / itemHeight) + overscan);
  const visible = useMemo(() => items.slice(startIndex, endIndex + 1), [items, startIndex, endIndex]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      role="list"
      aria-label={ariaLabel}
      className="relative w-full overflow-y-auto"
      style={{ height }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ position: "absolute", top: startIndex * itemHeight, left: 0, right: 0 }}>
          {visible.map((item, i) => (
            <div key={(item as any).id ?? i} role="listitem" style={{ height: itemHeight }} className="px-2">
              {renderItem(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/** ================================
 *  UI: Toasts
 *  ================================ */
const Toasts = memo(function Toasts({ toasts, remove }: { toasts: Toast[]; remove: (id: string) => void }) {
  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>, id: string) => {
      if (e.key === "Escape") remove(id);
    },
    [remove]
  );
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 space-y-2 z-50"
      role="region"
      aria-label={t("Notifications")}
    >
      {toasts.map((tst) => (
        <div
          key={tst.id}
          onKeyDown={(e) => onKeyDown(e, tst.id)}
          tabIndex={0}
          className={cx(
            "min-w-[260px] max-w-[360px] p-3 rounded shadow border bg-white focus:outline-none",
            tst.kind === "error" && "border-red-300",
            tst.kind === "success" && "border-green-300",
            tst.kind === "info" && "border-gray-200"
          )}
          role="status"
        >
          <div className="font-medium">{tst.title}</div>
          <div className="text-sm">{tst.message}</div>
          <div className="text-right mt-1">
            <button
              className="text-xs underline"
              onClick={() => remove(tst.id)}
              aria-label={t("Dismiss notification")}
            >
              {t("Dismiss")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});

/** ================================
 *  Presentational: InputArea
 *  ================================ */
const InputArea = memo(function InputArea({
  value,
  setValue,
  onSend,
  onKeyDownSend,
  canRewrite,
  disabledReason,
}: {
  value: string;
  setValue: (v: string) => void;
  onSend: () => void;
  onKeyDownSend: (e: ReactKeyboardEvent) => void;
  canRewrite: boolean;
  disabledReason: string | null;
}) {
  const onChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value), [setValue]);

  return (
    <section aria-labelledby="input-label" className="space-y-2">
      <h2 id="input-label" className="sr-only">
        {t("Input")}
      </h2>
      <label htmlFor="rewrite-input" className="block text-sm font-medium">
        {t("Enter text to rewrite")}
      </label>
      <textarea
        id="rewrite-input"
        aria-describedby="shortcut-hint"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDownSend}
        rows={8}
        className="w-full border rounded p-2"
        placeholder={t("Paste or type your text here")}
      />
      <div id="shortcut-hint" className="text-xs text-gray-600">
        {t("Shortcut")}: {t("Ctrl/Cmd + Enter")} {t("to rewrite")}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSend}
          disabled={!canRewrite}
          aria-disabled={!canRewrite}
          aria-label={t("Run rewrite")}
          className={cx(
            "px-3 py-2 rounded border",
            canRewrite ? "bg-black text-white" : "bg-gray-100 text-gray-500 cursor-not-allowed"
          )}
          title={disabledReason ?? undefined}
        >
          {t("Rewrite")}
        </button>
      </div>
    </section>
  );
});

/** ================================
 *  Presentational: StreamOutput
 *  ================================ */
const StreamOutput = memo(function StreamOutput({
  partial,
  output,
  status,
}: {
  partial: string;
  output: string;
  status: StreamStatus;
}) {
  const isBusy = status === "streaming";
  const text = status === "done" ? output : partial;
  return (
    <section aria-labelledby="output-label" className="space-y-2">
      <h2 id="output-label" className="sr-only">
        {t("Output")}
      </h2>
      <div
        role="region"
        aria-live="polite"
        aria-busy={isBusy}
        className="min-h-[160px] border rounded p-3 whitespace-pre-wrap"
      >
        {text || t("Output will appear here")}
      </div>
    </section>
  );
});

/** ================================
 *  Sidebars
 *  ================================ */
const RiskSidebar = memo(function RiskSidebar({
  open,
  onClose,
  analysis,
  containerRef,
}: {
  open: boolean;
  onClose: () => void;
  analysis: RiskAnalysis;
  containerRef: MutableRefObject<HTMLElement | null>;
}) {
  useFocusTrap(open, containerRef);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <aside
      ref={containerRef as any}
      role="complementary"
      aria-label={t("Risk analysis")}
      className={cx(
        "fixed top-0 right-0 h-full w-[320px] max-w-[80vw] border-l bg-white shadow-lg transition-transform",
        open ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="p-3 flex items-center justify-between border-b">
        <h2 className="font-semibold">{t("Risk analysis")}</h2>
        <button onClick={onClose} aria-label={t("Close sidebar")} className="rounded border px-2 py-1">
          {t("Close")}
        </button>
      </div>
      <div className="p-3 space-y-3">
        <div className="text-sm">
          {t("Risk score")}: <strong>{analysis?.score ?? 0}</strong> / 100
        </div>
        <ul role="list" className="space-y-2">
          {(analysis?.issues ?? []).map((it) => (
            <li key={it.id} role="listitem" className="text-sm flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cx(
                  "w-2 h-2 rounded-full inline-block",
                  it.severity === "high" && "bg-red-500",
                  it.severity === "medium" && "bg-yellow-500",
                  it.severity === "low" && "bg-green-500"
                )}
              />
              <span>{it.label}</span>
            </li>
          ))}
          {(!analysis?.issues || analysis.issues.length === 0) && (
            <li className="text-sm text-gray-600">{t("No issues detected")}</li>
          )}
        </ul>
      </div>
    </aside>
  );
});

const MetricsSidebar = memo(function MetricsSidebar({
  open,
  onClose,
  containerRef,
  metrics,
}: {
  open: boolean;
  onClose: () => void;
  containerRef: MutableRefObject<HTMLElement | null>;
  metrics: MetricEvent[];
}) {
  useFocusTrap(open, containerRef);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const renderItem = useCallback(
    (m: MetricEvent) => (
      <div className="text-xs grid grid-cols-3 gap-2 border-b py-2">
        <div className="font-mono">{new Date(m.ts).toLocaleTimeString()}</div>
        <div>{m.type}</div>
        <div className="truncate">{m.meta ? JSON.stringify(m.meta) : ""}</div>
      </div>
    ),
    []
  );

  return (
    <aside
      ref={containerRef as any}
      role="complementary"
      aria-label={t("Metrics")}
      className={cx(
        "fixed top-0 left-0 h-full w-[360px] max-w-[85vw] border-r bg-white shadow-lg transition-transform",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="p-3 flex items-center justify-between border-b">
        <h2 className="font-semibold">{t("Metrics")}</h2>
        <button onClick={onClose} aria-label={t("Close sidebar")} className="rounded border px-2 py-1">
          {t("Close")}
        </button>
      </div>
      <div className="p-3">
        <VirtualList
          items={metrics}
          itemHeight={40}
          height={480}
          ariaLabel={t("Metrics events")}
          renderItem={renderItem}
        />
      </div>
    </aside>
  );
});

/** ================================
 *  Main Page
 *  ================================ */
export default function Page() {
  const { toasts, push, remove } = useToasts();
  const { credits, canRewrite, freeQuotaRemaining, cooldownMs, canWatchAd, watchAd } = useAdGate();
  const [text, setText] = useState("");
  const { analysis } = useRiskAnalysis(text);
  const metrics = useStoreSelector(selectMetrics, (a, b) => a.length === b.length); // memoized
  const { state, startRewrite, cancel, isPending, onKeyDownSend } = useStreamedRewrite(push);

  const [riskOpen, setRiskOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const riskRef = useRef<HTMLElement | null>(null);
  const metricsRef = useRef<HTMLElement | null>(null);

  const disabledReason = useMemo(() => {
    if (!canRewrite) return t("Earn a credit to enable rewrite");
    return null;
  }, [canRewrite]);

  // Global ESC to close any sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRiskOpen(false);
        setMetricsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const onSend = useCallback(() => {
    if (!text.trim()) {
      push({ title: t("Empty input"), message: t("Enter text to rewrite"), kind: "info", ttlMs: 3000 });
      return;
    }
    if (!canRewrite) {
      push({
        title: t("No credits"),
        message: t("Watch an ad to get a free credit"),
        kind: "info",
        ttlMs: 4000,
      });
      return;
    }
    startRewrite(text.trim());
  }, [text, canRewrite, startRewrite, push]);

  const onGeneratePdf = useCallback(() => {
    // Print-friendly HTML report. Browser can save as PDF.
    const w = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
    if (!w) return;
    const content = `
      <html>
      <head>
        <title>${t("Rewrite Report")}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 24px; }
          h1 { font-size: 20px; margin: 0 0 12px 0; }
          pre { white-space: pre-wrap; border: 1px solid #eee; padding: 12px; border-radius: 6px; }
          .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
        </style>
      </head>
      <body>
        <h1>${t("Rewrite Report")}</h1>
        <div class="meta">${t("Generated at")}: ${new Date().toLocaleString()}</div>
        <h2>${t("Input")}</h2>
        <pre>${escapeHtml(state.input)}</pre>
        <h2>${t("Output")}</h2>
        <pre>${escapeHtml(state.output || state.partial)}</pre>
        <h2>${t("Risk score")}: ${analysis.score}</h2>
        <ul>
          ${(analysis.issues || [])
            .map((it) => `<li>${escapeHtml(it.label)} (${it.severity})</li>`)
            .join("")}
        </ul>
        <script>window.onload = () => setTimeout(() => window.print(), 100);</script>
      </body></html>`;
    w.document.write(content);
    w.document.close();
  }, [state.input, state.output, state.partial, analysis]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(state.output || state.partial || "");
      push({ title: t("Copied"), message: t("Output copied to clipboard"), kind: "success", ttlMs: 2000 });
    } catch {
      push({ title: t("Copy failed"), message: t("Select and copy manually"), kind: "error", ttlMs: 3000 });
    }
  }, [state.output, state.partial, push]);

  const showWatchAd = !canRewrite && freeQuotaRemaining > 0;

  return (
    <ErrorBoundary>
      <main role="main" className="max-w-4xl mx-auto p-4 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("Ad‑funded Rewriter")}</h1>
          <div className="flex items-center gap-3" aria-live="polite">
            <div className="text-sm">
              {t("Credits")}: <strong aria-live="polite">{credits}</strong>
            </div>
            <div className="text-sm">
              {t("Free quota")}: <strong aria-live="polite">{freeQuotaRemaining}</strong>
            </div>
            <Tooltip id="risk-tip" label={t("Analyze privacy and safety risks")}>
              <button
                type="button"
                onClick={() => setRiskOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={riskOpen}
                className="border rounded px-2 py-1"
              >
                {t("Risk")}
              </button>
            </Tooltip>
            <Tooltip id="metrics-tip" label={t("View metrics")}>
              <button
                type="button"
                onClick={() => setMetricsOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={metricsOpen}
                className="border rounded px-2 py-1"
              >
                {t("Metrics")}
              </button>
            </Tooltip>
          </div>
        </header>

        <InputArea
          value={text}
          setValue={setText}
          onSend={onSend}
          onKeyDownSend={onKeyDownSend}
          canRewrite={canRewrite}
          disabledReason={disabledReason}
        />

        {showWatchAd && (
          <div className="flex items-center gap-2" role="group" aria-label={t("Ad credit")}>
            <button
              type="button"
              onClick={watchAd}
              disabled={!canWatchAd}
              className={cx(
                "px-3 py-2 rounded border",
                canWatchAd ? "bg-yellow-200" : "bg-gray-100 text-gray-500 cursor-not-allowed"
              )}
              aria-disabled={!canWatchAd}
              aria-label={t("Watch ad to earn credit")}
            >
              {t("Watch ad to earn credit")}
            </button>
            {!canWatchAd && (
              <div aria-live="polite" className="text-sm text-gray-600">
                {t("Cooldown")}: {formatMs(cooldownMs)}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="px-3 py-2 rounded border"
            aria-label={t("Copy output")}
          >
            {t("Copy")}
          </button>
          <button
            type="button"
            onClick={onGeneratePdf}
            className="px-3 py-2 rounded border"
            aria-label={t("Export PDF report")}
          >
            {t("Export PDF")}
          </button>
          {state.status === "streaming" && (
            <button type="button" onClick={cancel} className="px-3 py-2 rounded border" aria-label={t("Cancel")}>
              {t("Cancel")}
            </button>
          )}
          <div className="text-sm text-gray-600" aria-live="polite">
            {isPending || state.status === "streaming" ? t("Streaming…") : null}
          </div>
        </div>

        <StreamOutput partial={state.partial} output={state.output} status={state.status} />

        <footer className="text-xs text-gray-600">
          {t("Privacy by default")}: {t("No input is stored. Metrics use counts only.")} {t("Abuse limits apply.")}{" "}
          {t("Errors are non‑PII.")}{" "}
        </footer>
      </main>

      <RiskSidebar open={riskOpen} onClose={() => setRiskOpen(false)} analysis={analysis} containerRef={riskRef} />
      <MetricsSidebar open={metricsOpen} onClose={() => setMetricsOpen(false)} metrics={metrics} containerRef={metricsRef} />
      <Toasts toasts={toasts} remove={remove} />
    </ErrorBoundary>
  );
}

/** ================================
 *  Helpers
 *  ================================ */
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}