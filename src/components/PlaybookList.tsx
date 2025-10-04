import type { Playbook } from '../config/playbooks';

interface PlaybookListProps {
  playbooks: Playbook[];
  selectedId?: string;
  onSelect: (id: string | null) => void;
}

export function PlaybookList({ playbooks, selectedId, onSelect }: PlaybookListProps) {
  return (
    <div className="flex flex-col gap-3">
      {playbooks.map(playbook => {
        const isSelected = playbook.id === selectedId;
        return (
          <button
            key={playbook.id}
            onClick={() => onSelect(playbook.id)}
            className={`text-left rounded-2xl border px-4 py-4 bg-white transition-colors shadow-sm hover:border-blue-500/70 ${
              isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-semibold">
                {playbook.label.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{playbook.label}</h3>
                  {isSelected && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Active</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">{playbook.description}</p>
                {playbook.exports && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {playbook.exports.map(format => (
                      <span key={format} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {format.toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}

      <button
        onClick={() => onSelect(null)}
        className={`text-left rounded-2xl border px-4 py-3 text-sm transition-colors bg-white hover:border-blue-300 ${
          selectedId ? 'border-gray-200 text-gray-600' : 'border-blue-500 text-blue-700'
        }`}
      >
        Clear playbook
      </button>
    </div>
  );
}
