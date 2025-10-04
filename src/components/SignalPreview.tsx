import type { SignalSet } from '../config/signalEngine';

interface SignalPreviewProps {
  signalSets: SignalSet[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function SignalPreview({ signalSets, selectedId, onSelect }: SignalPreviewProps) {
  return (
    <div className="flex flex-col gap-3">
      {signalSets.map(signalSet => {
        const isSelected = signalSet.id === selectedId;
        return (
          <button
            key={signalSet.id}
            onClick={() => onSelect(signalSet.id)}
            className={`text-left rounded-2xl border px-4 py-4 bg-white transition-colors shadow-sm hover:border-blue-500/70 ${
              isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center text-sm font-semibold">
                {signalSet.label.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{signalSet.label}</h3>
                  {isSelected && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Active</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">{signalSet.description}</p>

                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detectors</p>
                  <ul className="mt-2 space-y-2">
                    {signalSet.detectors.slice(0, 4).map(detector => (
                      <li key={detector.id} className="text-xs text-gray-600">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-700">{detector.label}</span>
                          <span className="text-[10px] text-gray-500 uppercase">
                            weight {(detector.weight * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">{detector.description}</p>
                      </li>
                    ))}
                    {signalSet.detectors.length > 4 && (
                      <li className="text-xs text-gray-500">+{signalSet.detectors.length - 4} more detectors</li>
                    )}
                  </ul>
                </div>

                <p className="text-xs text-gray-500 mt-3">
                  Scoring: {signalSet.scoring.combine} (hot ≥ {Math.round(signalSet.scoring.thresholds.hot * 100)}%)
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
