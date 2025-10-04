import { Plus, Sliders, ChevronDown, ArrowUp, Coins, ShieldCheck } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { estimateCredits, formatCreditRange, type CreditEstimate } from '../utils/creditEstimation';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  selectedAgent?: string;
  guardrailProfileName?: string;
  onGuardrailClick?: () => void;
  qualityChecklistSummary?: string;
  onEstimateChange?: (estimate: CreditEstimate | null) => void;
  onAttach?: () => void;
  onSettings?: () => void;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = 'Message agent...',
  selectedAgent = 'Research Agent',
  guardrailProfileName,
  onGuardrailClick,
  qualityChecklistSummary,
  onEstimateChange,
  onAttach,
  onSettings
}: MessageInputProps) {
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const creditEstimate = useMemo(() => {
    if (!value.trim()) return null;
    return estimateCredits(value);
  }, [value]);

  useEffect(() => {
    onEstimateChange?.(creditEstimate);
  }, [creditEstimate, onEstimateChange]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="w-full resize-none border-none outline-none text-gray-900 placeholder-gray-400 text-sm"
        style={{ minHeight: '24px', maxHeight: '200px', overflow: 'hidden' }}
        aria-label={placeholder || 'Message agent'}
      />

      {creditEstimate && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
          <Coins className="w-3.5 h-3.5" />
          <span>Estimated: {formatCreditRange(creditEstimate)}</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-400">{creditEstimate.description}</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onAttach}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Upload CSV for bulk research"
            aria-label="Upload CSV for bulk research"
          >
            <Plus className="w-4 h-4 text-gray-500" />
          </button>

          <button
            onClick={onSettings}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Bulk Research"
            aria-label="Bulk Research"
          >
            <Sliders className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {guardrailProfileName && (
            <button
              onClick={onGuardrailClick}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 hover:bg-emerald-100"
              title="Guardrail profile"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="font-semibold">{guardrailProfileName}</span>
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowAgentDropdown(!showAgentDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              aria-haspopup="listbox"
              aria-expanded={showAgentDropdown}
              aria-label={`Selected agent: ${selectedAgent}`}
            >
              <span className="font-medium">{selectedAgent}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            </button>

            {showAgentDropdown && (
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1" role="listbox">
                <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-900" role="option" aria-selected={selectedAgent === 'Research Agent'}>
                  Research Agent
                </button>
                <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-500" role="option" aria-selected={selectedAgent === 'Analysis Agent'}>
                  Analysis Agent
                </button>
                <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-500" role="option" aria-selected={selectedAgent === 'Writing Agent'}>
                  Writing Agent
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm hover:shadow-md"
            aria-label="Send message"
          >
            <ArrowUp className={`w-4 h-4 ${disabled || !value.trim() ? 'text-gray-500' : 'text-white'}`} />
          </button>
        </div>
      </div>

      {qualityChecklistSummary && (
        <div className="mt-3 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <span className="font-semibold text-gray-700">Quality bar:</span> {qualityChecklistSummary}
        </div>
      )}
    </div>
  );
}
