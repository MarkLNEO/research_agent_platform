import type { AgentType } from '../services/agents/types';

export interface ResearchSource {
  url: string;
  query?: string;
}

export interface ResearchDraft {
  subject: string;
  research_type: 'company' | 'prospect' | 'competitive' | 'market';
  executive_summary: string;
  markdown_report: string;
  icp_fit_score?: number;
  signal_score?: number;
  composite_score?: number;
  priority_level?: 'hot' | 'warm' | 'standard';
  confidence_level?: 'high' | 'medium' | 'low';
  sources?: ResearchSource[];
  company_data?: Record<string, any>;
  leadership_team?: any[];
  buying_signals?: any[];
  custom_criteria_assessment?: any[];
  personalization_points?: any[];
  recommended_actions?: any;
}

interface ResearchDraftInput {
  assistantMessage: string;
  userMessage?: string;
  chatTitle?: string | null;
  agentType?: AgentType | string;
  sources?: { query?: string; sources?: string[] }[] | ResearchSource[];
}

const agentTypeToResearchType: Record<string, ResearchDraft['research_type']> = {
  settings_agent: 'company',
  company_research: 'company',
  find_prospects: 'prospect',
  analyze_competitors: 'competitive',
  market_trends: 'market',
};

function inferResearchType(input: ResearchDraftInput): ResearchDraft['research_type'] {
  const agentType = input.agentType && agentTypeToResearchType[input.agentType];
  if (agentType) return agentType;

  const lowerAssistant = input.assistantMessage.toLowerCase();
  const lowerUser = (input.userMessage || '').toLowerCase();

  if (lowerAssistant.includes('prospect') || lowerUser.includes('prospect')) return 'prospect';
  if (lowerAssistant.includes('competitor') || lowerAssistant.includes('competitive')) return 'competitive';
  if (lowerAssistant.includes('trend') || lowerAssistant.includes('market')) return 'market';

  return 'company';
}

function inferSubject(input: ResearchDraftInput): string {
  if (input.chatTitle && input.chatTitle.trim() && input.chatTitle.trim().toLowerCase() !== 'new research') {
    return input.chatTitle.trim();
  }

  const headingMatch = input.assistantMessage.match(/^#+\s*(.+)$/m);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }

  const firstLine = input.assistantMessage.split('\n').map(line => line.trim()).find(Boolean);
  if (firstLine) {
    return firstLine.replace(/[*_#>-]/g, '').trim().slice(0, 120) || 'Research Insight';
  }

  if (input.userMessage) {
    return input.userMessage.slice(0, 120);
  }

  return 'Research Insight';
}

function buildSummary(markdown: string): string {
  const cleanText = markdown.replace(/\s+/g, ' ').trim();
  const sentences = cleanText.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(' ').slice(0, 400);
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeScores(markdown: string, sourcesCount: number) {
  const wordCount = markdown.split(/\s+/).filter(Boolean).length;
  const hasSignals = /signal|trigger|intent|buying/i.test(markdown);
  const hasIcp = /icp|ideal customer profile|fit score/i.test(markdown);
  const structureBonus = markdown.includes('##') ? 8 : 0;

  const baseCoverage = clampScore(40 + Math.min(50, wordCount / 4 + structureBonus));
  const icpFit = clampScore(45 + Math.min(40, wordCount / 5) + (hasIcp ? 10 : 0));
  const signalScore = clampScore(35 + Math.min(45, wordCount / 6) + (hasSignals ? 12 : 0) + sourcesCount * 3);
  const composite = clampScore(icpFit * 0.3 + signalScore * 0.4 + baseCoverage * 0.3);
  const priority: ResearchDraft['priority_level'] = composite >= 80 ? 'hot' : composite >= 60 ? 'warm' : 'standard';
  const confidence: ResearchDraft['confidence_level'] = sourcesCount >= 3 ? 'high' : sourcesCount === 0 ? 'low' : 'medium';

  return {
    icpFit,
    signalScore,
    composite,
    priority,
    confidence,
  };
}

function extractCompanyData(markdown: string): Record<string, string> {
  const result: Record<string, string> = {};
  const patterns: { key: string; regex: RegExp }[] = [
    { key: 'industry', regex: /(industry|sector)\s*[:-]\s*([^\n]+)/i },
    { key: 'size', regex: /(headcount|employees|company size)\s*[:-]\s*([^\n]+)/i },
    { key: 'location', regex: /(headquarters|location)\s*[:-]\s*([^\n]+)/i },
    { key: 'founded', regex: /(founded)\s*[:-]\s*([^\n]+)/i },
    { key: 'website', regex: /(website)\s*[:-]\s*(https?:\/\/\S+)/i },
  ];

  patterns.forEach(({ key, regex }) => {
    const match = markdown.match(regex);
    if (match?.[2]) {
      result[key] = match[2].trim();
    }
  });

  return result;
}

export function normalizeSourceEvents(events: ResearchDraftInput['sources']): ResearchSource[] {
  if (!events) return [];

  const map = new Map<string, ResearchSource>();
  const sourcesArray = Array.isArray(events) ? events : [];

  sourcesArray.forEach((entry) => {
    if ('url' in entry) {
      if (entry.url) {
        map.set(entry.url, { url: entry.url, query: entry.query });
      }
      return;
    }

    const sourceEntry = entry as { query?: string; sources?: string[] };
    sourceEntry.sources?.forEach(url => {
      if (!url) return;
      if (!map.has(url)) {
        map.set(url, { url, query: sourceEntry.query });
      }
    });
  });

  return Array.from(map.values());
}

export function approximateTokenCount(text: string): number {
  if (!text) return 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount * 1.5));
}

export function buildResearchDraft(input: ResearchDraftInput): ResearchDraft {
  let normalizedSources = normalizeSourceEvents(input.sources);
  const researchType = inferResearchType(input);
  const subject = inferSubject(input);
  const markdown = input.assistantMessage.trim();
  // If no captured sources from reasoning/search, attempt to extract first URL from markdown
  if (normalizedSources.length === 0) {
    const firstUrl = (markdown.match(/https?:\/\/[^\s)]+/i) || [])[0];
    if (firstUrl) {
      normalizedSources = [{ url: firstUrl }];
    }
  }
  const executiveSummary = buildSummary(markdown);
  const companyData = extractCompanyData(markdown);
  const { icpFit, signalScore, composite, priority, confidence } = computeScores(markdown, normalizedSources.length);

  return {
    subject,
    research_type: researchType,
    executive_summary: executiveSummary,
    markdown_report: markdown,
    icp_fit_score: icpFit,
    signal_score: signalScore,
    composite_score: composite,
    priority_level: priority,
    confidence_level: confidence,
    sources: normalizedSources,
    company_data: companyData,
    leadership_team: [],
    buying_signals: [],
    custom_criteria_assessment: [],
    personalization_points: [],
    recommended_actions: {},
  };
}
