import type { CapabilityPlan } from '../config/capabilityPlanner';

interface CapabilityPlanCardProps {
  plan: CapabilityPlan;
}

export function CapabilityPlanCard({ plan }: CapabilityPlanCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Planner Output</h3>
        <span className="text-xs text-gray-500">{plan.items.length} capabilities</span>
      </div>
      <div className="mt-4 space-y-4">
        {plan.items.map(item => (
          <div key={item.capability.id} className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.capability.label}</p>
                <p className="text-xs text-gray-500 mt-1">{item.capability.description}</p>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 uppercase font-semibold">
                {item.preferred.label}
              </span>
            </div>
            {item.fallbacks.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                Fallbacks: {item.fallbacks.map(provider => provider.label).join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
      {plan.notes.length > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <p className="font-semibold text-amber-900 mb-1">Planner Notes</p>
          <ul className="space-y-1">
            {plan.notes.map((note, index) => (
              <li key={index}>• {note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
