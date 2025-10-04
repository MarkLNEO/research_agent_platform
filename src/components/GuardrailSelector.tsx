import type { GuardrailProfile } from '../config/guardrails';

interface GuardrailSelectorProps {
  profiles: GuardrailProfile[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function GuardrailSelector({ profiles, selectedId, onSelect }: GuardrailSelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      {profiles.map(profile => {
        const isSelected = profile.id === selectedId;
        return (
          <button
            key={profile.id}
            onClick={() => onSelect(profile.id)}
            className={`text-left rounded-2xl border px-4 py-4 bg-white transition-colors shadow-sm hover:border-blue-500/70 ${
              isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold ${
                profile.id === 'secure'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-purple-50 text-purple-700'
              }`}>
                {profile.label.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{profile.label}</h3>
                  {isSelected && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Active</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">{profile.description}</p>

                <div className="mt-3 grid md:grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Guarantees</p>
                    <ul className="mt-1 space-y-1">
                      {profile.guarantees.slice(0, 3).map(item => (
                        <li key={item} className="text-xs text-gray-600 flex items-start gap-1">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Controls</p>
                    <ul className="mt-1 space-y-1">
                      <li className="text-xs text-gray-600">
                        Tokens: {profile.policy.max_tokens_per_task.toLocaleString()}
                      </li>
                      <li className="text-xs text-gray-600">Parallelism: {profile.policy.parallelism}</li>
                      {profile.policy.cost_controls && (
                        <li className="text-xs text-gray-600">
                          Cost cap: {profile.policy.cost_controls.max_credits_per_run} credits
                        </li>
                      )}
                    </ul>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mt-3">
                  Recommended for: {profile.recommended_for.join(', ')}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
