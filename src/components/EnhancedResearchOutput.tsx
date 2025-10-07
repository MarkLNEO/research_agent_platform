import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, AlertCircle, TrendingUp, Building2, Users, DollarSign, Shield, Briefcase } from 'lucide-react';
import { Streamdown } from 'streamdown';

interface ResearchSection {
  title: string;
  content: string;
  icon?: React.ReactNode;
  priority?: 'high' | 'medium' | 'low';
  signals?: Array<{
    type: string;
    severity: string;
    description: string;
  }>;
}

interface EnhancedResearchOutputProps {
  content: string;
  companyName?: string;
  signals?: Array<{
    type: string;
    severity: string;
    description: string;
  }>;
  sources?: Array<{
    url: string;
    title: string;
  }>;
  onSave?: () => void;
  onExportPDF?: () => void;
  onShare?: () => void;
}

export function EnhancedResearchOutput({ 
  content, 
  companyName, 
  signals = [],
  sources = [],
  onSave,
  onExportPDF,
  onShare
}: EnhancedResearchOutputProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0])); // First section expanded by default

  const toggleSection = (index: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSections(newExpanded);
  };

  // Parse content into sections
  const sections = parseContentIntoSections(content, signals);

  return (
    <div className="space-y-4">
      {/* Header */}
      {companyName && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{companyName}</h2>
              <p className="text-sm text-gray-600">Company Research Report</p>
            </div>
          </div>
        </div>
      )}

      {/* Signal Alerts */}
      {signals.length > 0 && (
        <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-red-900">🔥 {signals.length} Active Signal{signals.length > 1 ? 's' : ''}</h3>
          </div>
          <div className="space-y-2">
            {signals.map((signal, idx) => (
              <div key={idx} className="bg-white rounded-lg p-3 border border-red-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    signal.severity === 'critical' ? 'bg-red-100 text-red-800' :
                    signal.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {signal.severity.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{signal.type}</span>
                </div>
                <p className="text-sm text-gray-700">{signal.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Research Sections */}
      <div className="space-y-3">
        {sections.map((section, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <button
              onClick={() => toggleSection(index)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 flex-1">
                {section.icon && <div className="text-blue-600">{section.icon}</div>}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{section.title}</h3>
                  {section.signals && section.signals.length > 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      {section.signals.length} signal{section.signals.length > 1 ? 's' : ''} related
                    </p>
                  )}
                </div>
                {section.priority && (
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    section.priority === 'high' ? 'bg-red-100 text-red-700' :
                    section.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {section.priority}
                  </span>
                )}
              </div>
              {expandedSections.has(index) ? (
                <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" />
              )}
            </button>
            
            {expandedSections.has(index) && (
              <div className="px-4 pb-4 border-t border-gray-100">
                <Streamdown className="prose prose-sm max-w-none mt-3">
                  {section.content}
                </Streamdown>
                
                {section.signals && section.signals.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {section.signals.map((sig, idx) => (
                      <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-800">
                          <span className="font-semibold">{sig.type}:</span> {sig.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            Sources ({sources.length})
          </h3>
          <div className="space-y-2">
            {sources.map((source, idx) => (
              <a
                key={idx}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                {source.title || source.url}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-2 pt-2">
        {onSave && (
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save to Research
          </button>
        )}
        <button
          className="px-4 py-2 bg-white text-gray-700 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          onClick={onExportPDF}
        >
          Export as PDF
        </button>
        <button
          className="px-4 py-2 bg-white text-gray-700 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          onClick={onShare}
        >
          Share
        </button>
      </div>
    </div>
  );
}

// Helper function to parse content into structured sections
function parseContentIntoSections(content: string, signals: Array<any>): ResearchSection[] {
  const sections: ResearchSection[] = [];
  
  // Split by markdown headings
  const parts = content.split(/^##\s+(.+)$/gm);
  
  // First part is intro/executive summary
  if (parts[0].trim()) {
    sections.push({
      title: 'Executive Summary',
      content: parts[0].trim(),
      icon: <Briefcase className="w-5 h-5" />,
      priority: 'high'
    });
  }
  
  // Process remaining sections
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i];
    const content = parts[i + 1] || '';
    
    // Determine icon and priority based on title
    let icon: React.ReactNode = <Building2 className="w-5 h-5" />;
    let priority: 'high' | 'medium' | 'low' = 'medium';
    
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('financial') || lowerTitle.includes('revenue') || lowerTitle.includes('funding')) {
      icon = <DollarSign className="w-5 h-5" />;
      priority = 'high';
    } else if (lowerTitle.includes('security') || lowerTitle.includes('breach') || lowerTitle.includes('risk')) {
      icon = <Shield className="w-5 h-5" />;
      priority = 'high';
    } else if (lowerTitle.includes('leadership') || lowerTitle.includes('executive') || lowerTitle.includes('team')) {
      icon = <Users className="w-5 h-5" />;
    } else if (lowerTitle.includes('growth') || lowerTitle.includes('trend') || lowerTitle.includes('market')) {
      icon = <TrendingUp className="w-5 h-5" />;
    }
    
    // Check if this section relates to any signals
    const relatedSignals = signals.filter(sig => 
      content.toLowerCase().includes(sig.type.toLowerCase()) ||
      title.toLowerCase().includes(sig.type.toLowerCase())
    );
    
    sections.push({
      title,
      content: content.trim(),
      icon,
      priority: relatedSignals.length > 0 ? 'high' : priority,
      signals: relatedSignals.length > 0 ? relatedSignals : undefined
    });
  }
  
  return sections;
}
