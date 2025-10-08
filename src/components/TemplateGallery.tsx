import type { UseCaseTemplate } from '../config/researchTemplates';

interface TemplateGalleryProps {
  templates: UseCaseTemplate[];
  selectedTemplateId: string | null;
  onSelect: (id: string) => void;
}

export function TemplateGallery({ templates, selectedTemplateId, onSelect }: TemplateGalleryProps) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {templates.map(template => {
        const Icon = template.icon;
        const isSelected = template.id === selectedTemplateId;

        return (
          <button
            key={template.id}
            onClick={() => onSelect(template.id)}
            className={`text-left rounded-2xl border transition-colors shadow-sm px-4 py-5 bg-white hover:border-blue-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
              isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                {Icon ? <Icon className="w-5 h-5" /> : <span className="text-sm font-semibold">{template.label[0]}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{template.label}</h3>
                    <p className="text-xs uppercase tracking-wide text-blue-600/80 mt-1">{template.category.replace('_', ' ')}</p>
                  </div>
                  <span className="text-xs text-gray-500">v{template.version}</span>
                </div>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{template.description}</p>

                {template.tags && template.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {template.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sections</p>
                    <ul className="mt-1 space-y-1">
                      {template.sections.slice(0, 3).map(section => (
                        <li key={section.id} className="text-xs text-gray-600 flex items-start gap-1">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          <span>{section.label ?? section.id}</span>
                        </li>
                      ))}
                      {template.sections.length > 3 && (
                        <li className="text-xs text-gray-500">+{template.sections.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exports</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {template.export.map(format => (
                        <span key={format} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                          {format.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {template.success_criteria && (
                  <div className="mt-4 bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quality Bar</p>
                    <ul className="mt-2 space-y-1">
                      {template.success_criteria.map(criteria => (
                        <li key={criteria} className="text-xs text-gray-600 flex items-start gap-1">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>{criteria}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
