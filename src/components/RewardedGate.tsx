// src/components/RewardedGate.tsx
import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type RewardedGateState = 'idle' | 'loading' | 'rewarded' | 'failed' | 'cooldown';

type MetricType = 'open' | 'earn' | 'cancel' | 'error';

export interface RewardedGateMetric {
  type: MetricType;
  timestamp: number;
  data?: Record<string, unknown>;
  namespace: string;
}

export interface RewardedGateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onError'> {
  /** Controlled visibility. Backward-compat: will also honor `isOpen`. */
  open?: boolean;
  /** Backward-compat alias for `open`. */
  isOpen?: boolean;

  /** Called when user earns the reward. */
  onEarned?: () => void;
  /** Called when user cancels or closes. */
  onCancel?: () => void;
  /** Called when an error occurs. */
  onError?: (error: Error) => void;

  /** Optional metrics callback; fired for open, earn, cancel, error. */
  onMetricEvent?: (event: RewardedGateMetric) => void;
  /** Namespace for metrics events. */
  metricsNamespace?: string;

  /** Parent close handler for controlled modals. Backward-compat alias `onClose` allowed. */
  onRequestClose?: () => void;
  onClose?: () => void;

  /** Cooldown controls from store selectors (prevent rapid reopen). Use any one. */
  isCoolingDown?: boolean;
  cooldownRemainingMs?: number;
  cooldownSeconds?: number;
  cooldownUntil?: number | Date;

  /** Anti-bot friction controls. */
  antiBotDelayMs?: number; // delay before enabling CTA
  requireHumanCheckbox?: boolean;

  /** Overlay click to close. */
  overlayClosable?: boolean;

  /** Simulated ad duration if no provider hook is supplied. */
  simulatedAdDurationMs?: number;

  /** Hook points for provider integration (e.g., IMA). */
  /** Prepare/load an ad if needed. Resolve when ready. */
  requestAd?: () => Promise<void>;
  /** Play the ad. Resolve ONLY when reward should be granted. Reject on failure. */
  playAd?: () => Promise<void>;

  /** Auto-close after reward. */
  autoCloseOnReward?: boolean;

  /** Element id to return focus to after close. Fallback to last active element. */
  returnFocusToId?: string;

  /** Optional title/description overrides. */
  title?: string;
  description?: string;
}

/** ---- Internal utilities ---- */
const now = () => Date.now();

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const formatSeconds = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${s}s`;
};

const getFocusable = (root: HTMLElement) => {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(selectors));
  // Filter out hidden or inert
  return nodes.filter((el) => {
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && !el.hasAttribute('inert');
  });
};

const useInterval = (fn: () => void, ms: number | null) => {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  useEffect(() => {
    if (ms == null) return;
    const id = window.setInterval(() => fnRef.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
};

const LiveRegion: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
    {children}
  </div>
);

const ProgressBar: React.FC<{
  value: number; // 0..1
  label?: string;
  id?: string;
}> = ({ value, label, id }) => {
  const pct = Math.round(clamp01(value) * 100);
  return (
    <div
      aria-label={label}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      id={id}
      style={{
        width: '100%',
        height: 8,
        background: 'rgba(0,0,0,0.1)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
      data-testid="rg-progress"
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: 'currentColor',
          opacity: 0.7,
          transition: 'width 150ms linear',
        }}
      />
    </div>
  );
};

/** ---- Component ---- */
export const RewardedGate: React.FC<RewardedGateProps> = (props) => {
  const {
    open,
    isOpen,
    onRequestClose,
    onClose,
    onEarned,
    onCancel,
    onError,
    onMetricEvent,
    metricsNamespace = 'rewarded_gate',
    isCoolingDown,
    cooldownRemainingMs,
    cooldownSeconds,
    cooldownUntil,
    antiBotDelayMs = 1200,
    requireHumanCheckbox = true,
    overlayClosable = true,
    simulatedAdDurationMs = 10000,
    requestAd,
    playAd,
    autoCloseOnReward = true,
    returnFocusToId,
    title = 'Watch an ad to continue',
    description = 'View a short ad to unlock access. You will receive credit after completion.',
    children,
    ...rest
  } = props;

  const isVisible = !!(open ?? isOpen);

  // Cooldown computation
  const cooldownTargetMs = useMemo(() => {
    if (cooldownRemainingMs != null) return now() + Math.max(0, cooldownRemainingMs);
    if (cooldownSeconds != null) return now() + Math.max(0, cooldownSeconds) * 1000;
    if (cooldownUntil instanceof Date) return cooldownUntil.getTime();
    if (typeof cooldownUntil === 'number') return cooldownUntil;
    return null;
  }, [cooldownRemainingMs, cooldownSeconds, cooldownUntil]);

  const [cooldownLeftMs, setCooldownLeftMs] = useState<number>(0);
  const computedCoolingDown = !!(isCoolingDown || (cooldownTargetMs != null && cooldownTargetMs > now()));
  useInterval(() => {
    if (cooldownTargetMs != null) {
      setCooldownLeftMs(Math.max(0, cooldownTargetMs - now()));
    }
  }, computedCoolingDown ? 250 : null);

  // State machine
  const [state, setState] = useState<RewardedGateState>('idle');
  const [humanChecked, setHumanChecked] = useState(false);
  const [readyAt, setReadyAt] = useState<number>(0);
  const [adStartAt, setAdStartAt] = useState<number | null>(null);
  const [adProgress, setAdProgress] = useState(0); // 0..1
  const [loadingMsg, setLoadingMsg] = useState('Loading ad…');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Focus management
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const titleId = useId();
  const descId = useId();
  const progressId = useId();
  const liveId = useId();

  // Metrics
  const fireMetric = useCallback(
    (type: MetricType, data?: Record<string, unknown>) => {
      const evt: RewardedGateMetric = {
        type,
        timestamp: now(),
        data,
        namespace: metricsNamespace,
      };
      try {
        onMetricEvent?.(evt);
      } catch {
        // ignore consumer errors
      }
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('rewarded_gate_metric', { detail: evt }));
        }
      } catch {
        // ignore
      }
    },
    [metricsNamespace, onMetricEvent]
  );

  // Open/close side effects
  useEffect(() => {
    if (isVisible) {
      fireMetric('open');
      setState(computedCoolingDown ? 'cooldown' : 'idle');
      setHumanChecked(false);
      setErrorMsg(null);
      setAdProgress(0);
      setAdStartAt(null);
      setLoadingMsg('Loading ad…');
      setReadyAt(now() + Math.max(0, antiBotDelayMs));
      // focus
      if (typeof document !== 'undefined') {
        previouslyFocused.current = document.activeElement as HTMLElement;
      }
      // timeout to focus close button after render
      const t = window.setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 0);
      return () => {
        window.clearTimeout(t);
      };
    } else {
      // return focus to trigger
      const el =
        (returnFocusToId && typeof document !== 'undefined'
          ? (document.getElementById(returnFocusToId) as HTMLElement | null)
          : null) || previouslyFocused.current;
      try {
        el?.focus();
      } catch {
        // ignore focus errors
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  // Trap focus within modal
  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!modalRef.current) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCancel();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = getFocusable(modalRef.current);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
        const direction = e.shiftKey ? -1 : 1;
        let nextIndex = currentIndex + direction;
        if (nextIndex >= focusables.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = focusables.length - 1;
        e.preventDefault();
        focusables[nextIndex].focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isVisible]);

  // Simulated ad timer when no provider hook is supplied
  useInterval(() => {
    if (adStartAt == null) return;
    const elapsed = now() - adStartAt;
    const pct = clamp01(elapsed / simulatedAdDurationMs);
    setAdProgress(pct);
    if (pct >= 1) {
      handleAdCompleted();
    }
  }, adStartAt != null && !playAd ? 100 : null);

  // Anti-bot countdown
  const [frictionLeftMs, setFrictionLeftMs] = useState(0);
  useInterval(
    () => setFrictionLeftMs(Math.max(0, (readyAt || 0) - now())),
    isVisible && state === 'idle' ? 100 : null
  );

  const canStartAd =
    state === 'idle' && (!requireHumanCheckbox || humanChecked) && now() >= readyAt && !computedCoolingDown;

  const closeControlled = useCallback(() => {
    onRequestClose?.();
    onClose?.();
  }, [onRequestClose, onClose]);

  const handleCancel = useCallback(() => {
    if (!isVisible) return;
    fireMetric('cancel');
    onCancel?.();
    closeControlled();
  }, [isVisible, closeControlled, onCancel, fireMetric]);

  const handleAdCompleted = useCallback(() => {
    setState('rewarded');
    setAdStartAt(null);
    setAdProgress(1);
    try {
      onEarned?.();
    } finally {
      fireMetric('earn');
    }
    if (autoCloseOnReward) {
      closeControlled();
    }
  }, [autoCloseOnReward, closeControlled, fireMetric, onEarned]);

  const startAdFlow = useCallback(async () => {
    if (!canStartAd) return;
    setErrorMsg(null);
    setState('loading');

    // TODO: Integrate provider here (e.g., Google IMA).
    // Expected contract:
    // 1) await requestAd?.()
    // 2) await playAd?.() // resolves only when rewarded, throws on error/cancel
    try {
      if (requestAd) {
        setLoadingMsg('Preparing ad…');
        await requestAd();
      }
      if (playAd) {
        setLoadingMsg('Starting ad…');
        await playAd();
        handleAdCompleted();
        return;
      }
      // Fallback simulation if no hooks provided
      setLoadingMsg('Starting ad…');
      setAdStartAt(now());
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState('failed');
      setErrorMsg(error.message || 'Ad failed to play.');
      try {
        onError?.(error);
      } finally {
        fireMetric('error', { message: error.message });
      }
    }
  }, [canStartAd, requestAd, playAd, handleAdCompleted, onError, fireMetric]);

  // Overlay click handling
  const onOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!overlayClosable) return;
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [overlayClosable, handleCancel]
  );

  // Cooldown progress (for bar)
  const cooldownProgress = useMemo(() => {
    if (!cooldownTargetMs) return 0;
    const total = cooldownTargetMs - (cooldownTargetMs - (cooldownLeftMs || 0));
    const remaining = cooldownLeftMs;
    if (!remaining || remaining <= 0 || total <= 0) return 1;
    // we do not know original total reliably; show inverse countdown instead
    // visualize remaining shrinking from 1 to 0
    const approxWindow = 30000; // arbitrary normalization to avoid 0-length bars
    return 1 - clamp01(remaining / approxWindow);
  }, [cooldownTargetMs, cooldownLeftMs]);

  if (!isVisible) return null;

  const content = (
    <div
      {...rest}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={onOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      data-testid="rg-overlay"
    >
      <div
        ref={modalRef}
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#fff',
          color: '#111',
          borderRadius: 8,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          padding: 20,
          outline: 'none',
          position: 'relative',
        }}
      >
        <button
          ref={closeBtnRef}
          onClick={handleCancel}
          aria-label="Close"
          title="Close"
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <h2 id={titleId} style={{ margin: '4px 0 8px' }}>
          {title}
        </h2>
        <p id={descId} style={{ margin: '0 0 16px', color: '#444' }}>
          {description}
        </p>

        {/* States */}
        {state === 'cooldown' && (
          <div aria-live="assertive">
            <p style={{ margin: '0 0 8px' }}>Please wait before trying again.</p>
            <p style={{ margin: '0 0 12px' }}>
              Cooldown: <strong>{formatSeconds(cooldownLeftMs)}</strong>
            </p>
            <ProgressBar value={cooldownProgress} label="Cooldown progress" id={progressId} />
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={handleCancel}>Close</button>
            </div>
          </div>
        )}

        {state === 'idle' && !computedCoolingDown && (
          <div>
            {children}
            {requireHumanCheckbox && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={humanChecked}
                  onChange={(e) => setHumanChecked(e.target.checked)}
                  aria-describedby={liveId}
                />
                I am a human
              </label>
            )}
            <div style={{ margin: '8px 0 12px' }}>
              <ProgressBar
                value={clamp01(1 - frictionLeftMs / Math.max(antiBotDelayMs, 1))}
                label="Ready timer"
              />
              <div id={liveId} style={{ marginTop: 6, fontSize: 12, color: '#555' }}>
                {frictionLeftMs > 0
                  ? `Ready in ${formatSeconds(frictionLeftMs)}`
                  : 'Ready to start'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={handleCancel}>Cancel</button>
              <button onClick={startAdFlow} disabled={!canStartAd} aria-disabled={!canStartAd}>
                Watch ad
              </button>
            </div>
          </div>
        )}

        {state === 'loading' && (
          <div>
            <p style={{ margin: '0 0 12px' }}>{loadingMsg}</p>
            {playAd ? (
              <div aria-busy="true" aria-live="polite" style={{ fontSize: 12, color: '#666' }}>
                Loading… {/* Provider controls progress UI in real flow */}
              </div>
            ) : (
              <>
                <ProgressBar value={adProgress} label="Ad progress" />
                <p style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                  {Math.round(adProgress * 100)}%
                </p>
              </>
            )}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        )}

        {state === 'rewarded' && (
          <div aria-live="assertive">
            <p style={{ margin: '0 0 12px' }}>
              Reward granted. Thank you for supporting free access.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={closeControlled}>Close</button>
            </div>
          </div>
        )}

        {state === 'failed' && (
          <div aria-live="assertive">
            <p style={{ margin: '0 0 12px', color: '#b00020' }}>
              {errorMsg || 'The ad could not be completed.'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={handleCancel}>Close</button>
            </div>
          </div>
        )}

        {/* Live region for screen readers */}
        <LiveRegion>{state}</LiveRegion>
      </div>
    </div>
  );

  // Render in portal to body
  const portalTarget =
    typeof document !== 'undefined' ? (document.body as HTMLElement) : (null as unknown as HTMLElement);

  return createPortal(content, portalTarget);
};

export default RewardedGate;