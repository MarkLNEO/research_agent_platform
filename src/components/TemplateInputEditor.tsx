import type { ChangeEvent } from 'react';
import type { UseCaseTemplate } from '../config/researchTemplates';

interface TemplateInputEditorProps {
  template: UseCaseTemplate;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function TemplateInputEditor({ template, values, onChange }: TemplateInputEditorProps) {
  const handleTextChange = (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(key, event.target.value);
  };

  const handleNumberChange = (key: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onChange(key, value ? Number(value) : undefined);
  };

  const handleEnumToggle = (key: string, option: string) => {
    const currentValue = Array.isArray(values[key]) ? (values[key] as string[]) : [];
    if (currentValue.includes(option)) {
      onChange(
        key,
        currentValue.filter(item => item !== option)
      );
    } else {
      onChange(key, [...currentValue, option]);
    }
  };

  return (
    <div className="space-y-4">
      {Object.values(template.inputs).map(input => {
        const value = values[input.key];
        const helper = input.description;

        if (input.type === 'enum[]' && input.values) {
          const currentArray = Array.isArray(value) ? (value as string[]) : [];
          return (
            <div key={input.key} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{input.label}</p>
                  {helper && <p className="text-xs text-gray-500 mt-1">{helper}</p>}
                </div>
                {input.required && <span className="text-xs font-medium text-blue-600">Required</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {input.values.map(option => {
                  const selected = currentArray.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleEnumToggle(input.key, option)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                        selected
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-blue-300'
                      }`}
                    >
                      {option.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        if (input.type === 'boolean') {
          const boolValue = Boolean(value);
          return (
            <label
              key={input.key}
              className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-start gap-3"
            >
              <input
                type="checkbox"
                checked={boolValue}
                onChange={event => onChange(input.key, event.target.checked)}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">{input.label}</p>
                {helper && <p className="text-xs text-gray-500 mt-1">{helper}</p>}
              </div>
            </label>
          );
        }

        if (input.type === 'number') {
          return (
            <div key={input.key} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-900" htmlFor={input.key}>
                    {input.label}
                  </label>
                  {helper && <p className="text-xs text-gray-500 mt-1">{helper}</p>}
                </div>
                {input.required && <span className="text-xs font-medium text-blue-600">Required</span>}
              </div>
              <input
                id={input.key}
                type="number"
                value={typeof value === 'number' ? value : ''}
                onChange={handleNumberChange(input.key)}
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          );
        }

        if (input.type === 'string[]') {
          const joinedValue = Array.isArray(value) ? (value as string[]).join(', ') : '';
          return (
            <div key={input.key} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-900" htmlFor={input.key}>
                    {input.label}
                  </label>
                  {helper && <p className="text-xs text-gray-500 mt-1">{helper}</p>}
                </div>
                {input.required && <span className="text-xs font-medium text-blue-600">Required</span>}
              </div>
              <input
                id={input.key}
                type="text"
                value={joinedValue}
                onChange={event => onChange(input.key, event.target.value.split(',').map(item => item.trim()).filter(Boolean))}
                placeholder={input.placeholder}
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          );
        }

        return (
          <div key={input.key} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <label className="text-sm font-semibold text-gray-900" htmlFor={input.key}>
                  {input.label}
                </label>
                {helper && <p className="text-xs text-gray-500 mt-1">{helper}</p>}
              </div>
              {input.required && <span className="text-xs font-medium text-blue-600">Required</span>}
            </div>
            <input
              id={input.key}
              type="text"
              value={typeof value === 'string' ? value : ''}
              onChange={handleTextChange(input.key)}
              placeholder={input.placeholder}
              className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );
      })}
    </div>
  );
}
