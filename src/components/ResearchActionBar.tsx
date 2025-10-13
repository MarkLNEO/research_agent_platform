import { useMemo } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

export type ResearchAction =
  | 'new'
  | 'continue'
  | 'summarize'
  | 'email'
  | 'refine'
  | 'dismiss';

interface ResearchActionBarProps {
  companyName?: string | null;
  disabled?: boolean;
  onAction: (action: ResearchAction) => void;
}

const ACTION_CONFIG = [
  {
    id: 'new' as ResearchAction,
    label: 'Start new',
    icon: '➕',
    variant: 'secondary' as const,
  },
  {
    id: 'continue' as ResearchAction,
    label: (company?: string | null) => (company ? `Continue with ${company}` : 'Continue research'),
    icon: '🔄',
    variant: 'primary' as const,
  },
  {
    id: 'summarize' as ResearchAction,
    label: 'Summarize',
    icon: '📝',
    variant: 'secondary' as const,
  },
  {
    id: 'email' as ResearchAction,
    label: 'Email draft',
    icon: '✉️',
    variant: 'secondary' as const,
  },
  {
    id: 'refine' as ResearchAction,
    label: 'Refine scope',
    icon: '🎯',
    variant: 'secondary' as const,
  },
] as const;

export function ResearchActionBar({ companyName, disabled = false, onAction }: ResearchActionBarProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  const actions = useMemo(
    () =>
      ACTION_CONFIG.map((cfg) => ({
        ...cfg,
        label: typeof cfg.label === 'function' ? cfg.label(companyName) : cfg.label,
      })),
    [companyName]
  );

  const baseClass =
    'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variantClass = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-md hover:shadow-lg disabled:bg-blue-300 disabled:cursor-not-allowed',
    secondary:
      'bg-white text-gray-700 border-2 border-gray-300 hover:border-blue-500 hover:text-blue-700 focus:ring-blue-500 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed',
  };

  return (
    <div
      className={`${
        isMobile ? 'fixed bottom-0 left-0 right-0' : 'sticky bottom-4'
      } bg-white border-t-2 md:border-2 border-gray-200 ${isMobile ? '' : 'rounded-xl'} shadow-xl p-4 z-50`}
      style={isMobile ? { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' } : undefined}
      role="toolbar"
      aria-label="Research actions"
    >
      <div className="max-w-5xl mx-auto space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
              ⓘ
            </span>
            What would you like to do next?
          </p>
          {isMobile && (
            <button
              type="button"
              onClick={() => onAction('dismiss')}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Dismiss action bar"
            >
              ✕
            </button>
          )}
        </div>

        <div className={`${isMobile ? 'flex gap-2 overflow-x-auto pb-2 -mx-4 px-4' : 'flex flex-wrap gap-2'}`}>
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(action.id)}
              disabled={disabled}
              className={`${baseClass} ${variantClass[action.variant]}`}
              aria-label={action.label}
            >
              <span>{action.icon}</span>
              <span className="whitespace-nowrap">{action.label}</span>
            </button>
          ))}
        </div>

        {!isMobile && (
          <p className="text-xs text-gray-500 text-center">
            Shortcuts:&nbsp;
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">N</kbd> new •{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">C</kbd>{' '}
            continue •{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">S</kbd>{' '}
            summarize •{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">E</kbd> email •{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">R</kbd> refine
          </p>
        )}
      </div>
    </div>
  );
}
