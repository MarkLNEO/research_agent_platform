import { useEffect, useMemo, useRef, useState } from 'react';

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'error';

export interface LoadingStep {
  key: string;
  title: string;
  status: StepStatus;
}

interface LoadingGateProps {
  steps: LoadingStep[];
  onContinueNow: () => void;
  onRetry?: (key?: string) => void;
  autoContinueMs?: number; // default 10s
  showContinueAfterMs?: number; // default 3s
}

export function LoadingGate({
  steps,
  onContinueNow,
  onRetry,
  autoContinueMs = 10000,
  showContinueAfterMs = 3000,
}: LoadingGateProps) {
  const [showContinue, setShowContinue] = useState(false);
  const autoTimerRef = useRef<number | null>(null);
  const continueTimerRef = useRef<number | null>(null);

  useEffect(() => {
    continueTimerRef.current = window.setTimeout(() => setShowContinue(true), showContinueAfterMs);
    autoTimerRef.current = window.setTimeout(() => onContinueNow(), autoContinueMs);
    return () => {
      if (continueTimerRef.current) window.clearTimeout(continueTimerRef.current);
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    };
  }, [autoContinueMs, onContinueNow, showContinueAfterMs]);

  const anyError = useMemo(() => steps.some(s => s.status === 'error'), [steps]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50" data-testid="loading-gate">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl px-6 py-5 w-full max-w-md">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" aria-hidden></span>
          <h2 className="text-base font-semibold text-gray-900">Spinning up your workspace</h2>
        </div>
        <p className="text-xs text-gray-600 mt-1">I’ll finish setup in the background — you can continue anytime.</p>

        <div className="mt-3 space-y-2">
          {steps.map((s) => (
            <div key={s.key} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-1 h-2 w-2 rounded-full ${
                  s.status === 'done' ? 'bg-emerald-500' : s.status === 'in_progress' ? 'bg-blue-500 animate-pulse' : s.status === 'error' ? 'bg-red-500' : 'bg-gray-300'
                }`}
                aria-hidden
              />
              <span className={`text-gray-800 ${s.status === 'error' ? 'text-red-700' : ''}`}>{s.title}</span>
              {s.status === 'error' && onRetry && (
                <button onClick={() => onRetry(s.key)} className="ml-auto text-xs text-blue-700 hover:underline">Retry</button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          {showContinue ? (
            <button
              type="button"
              onClick={onContinueNow}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Continue now
            </button>
          ) : (
            <div className="text-xs text-gray-500">Preparing…</div>
          )}
          <div className="text-[11px] text-gray-500">
            {anyError ? 'Some steps will retry silently' : 'Running in background'}
          </div>
        </div>
      </div>
    </div>
  );
}
