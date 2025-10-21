import type { AgentType, UserProfile } from '../services/agents/types';

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
  activeSubject?: string | null;
  userProfile?: Partial<UserProfile> | null;
}

const agentTypeToResearchType: Record<string, ResearchDraft['research_type']> = {
  settings_agent: 'company',
  company_research: 'company',
  find_prospects: 'prospect',
  analyze_competitors: 'competitive',
  market_trends: 'market',
};

const ICP_META_BLOCK_REGEX = /```icp_meta[\s\S]*?```/gi;

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

const IGNORED_SUBJECTS = new Set([
  'company research',
  'company researcher',
  'research insight',
  'new research',
  'new session',
  'bulk research',
  'profile coach',
]);

function sanitizeSubject(subject: string, input: ResearchDraftInput): string {
  const trimmed = subject.trim();
  const lower = trimmed.toLowerCase();
  const active = (input.activeSubject || '').trim();
  const returnActive = () => (active ? active : trimmed || (input.userMessage || '').trim());

  if (!trimmed) return returnActive();
  if (IGNORED_SUBJECTS.has(lower)) return returnActive();
  if (lower.startsWith('research:')) {
    const tail = lower.replace(/^research:\s*/, '');
    if (!tail || IGNORED_SUBJECTS.has(tail)) return returnActive();
  }
  return trimmed;
}

function inferSubject(input: ResearchDraftInput): string {
  if (input.chatTitle && input.chatTitle.trim() && input.chatTitle.trim().toLowerCase() !== 'new research') {
    const normalizedTitle = input.chatTitle.trim();
    const lowerTitle = normalizedTitle.toLowerCase();
    if (!IGNORED_SUBJECTS.has(lowerTitle)) {
      return normalizedTitle;
    }
  }

  const headingMatch = input.assistantMessage.match(/^#+\s*(.+)$/m);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }

  if (input.userMessage) {
    const user = input.userMessage.trim();
    const researchRegex = /^research\s+(.+)/i;
    const match = researchRegex.exec(user);
    if (match?.[1]) {
      return match[1].trim();
    }
    if (user.length <= 120) {
      return user;
    }
    return user.slice(0, 120);
  }

  const firstLine = input.assistantMessage.split('\n').map(line => line.trim()).find(Boolean);
  if (firstLine) {
    return firstLine.replace(/[*_#>-]/g, '').trim().slice(0, 120) || 'Research Insight';
  }

  return 'Research Insight';
}

const EXEC_HEADING = 'Executive Summary';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripMarkdown = (text: string): string => {
  return text
    .replace(/```[\s\S]*?```/g, ' ') // remove code fences
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1') // links
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^[-#>]+\s*/gm, '') // headings / blockquotes / lists
    .replace(/^\d+\.\s*/gm, '')
    .replace(/^\(?[a-zA-Z0-9]\)\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractSection = (markdown: string, heading: string): string | null => {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*\n([\\s\\S]*?)(?=^##\\s+|$)`, 'im');
  const match = pattern.exec(markdown);
  if (match) {
    return match[1].trim();
  }
  return null;
};

const normalizeLinesToSentences = (text: string): string => {
  return text
    .replace(/\r/g, '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    // Strip common list markers
    .map(line => line.replace(/^[-*•\u2022]+\s*/, ''))
    .map(line => line.replace(/^\d+[.)]\s*/, ''))
    // Strip markdown heading and blockquote markers at line start so they don't leak into sentences
    .map(line => line.replace(/^#{1,6}\s*/, ''))
    .map(line => line.replace(/^>+\s*/, ''))
    .map(line => (/[.!?]$/.test(line) ? line : `${line}.`))
    .join(' ');
};

function buildSummary(markdown: string): string {
  const executiveBlock = extractSection(markdown, EXEC_HEADING);
  const sourceText = executiveBlock || markdown;
  const normalized = normalizeLinesToSentences(sourceText);
  const stripped = stripMarkdown(normalized);
  const sentences = stripped.split(/(?<=[.!?])\s+/).filter(sentence => sentence && sentence.length > 12);

  if (sentences.length > 0) {
    const summary = sentences.slice(0, 3).join(' ');
    return summary.length > 400 ? `${summary.slice(0, 397).trimEnd()}…` : summary;
  }

  const fallback = stripMarkdown(markdown).slice(0, 320);
  return fallback ? `${fallback}${fallback.length >= 320 ? '…' : ''}` : '';
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeScores(markdown: string, sourcesCount: number) {
  const hasSignals = /signal|trigger|intent|buying/i.test(markdown);
  const hasIcp = /icp|ideal customer profile|fit score/i.test(markdown);
  const hasStructure = /##\s+/.test(markdown);

  const baseCoverage = clampScore(60 + sourcesCount * 4 + (hasStructure ? 5 : 0));
  const icpFit = clampScore(65 + sourcesCount * 4 + (hasIcp ? 8 : 0) + (hasStructure ? 3 : 0));
  const signalScore = clampScore(60 + sourcesCount * 5 + (hasSignals ? 10 : 0));
  const composite = clampScore(icpFit * 0.3 + signalScore * 0.4 + baseCoverage * 0.3);
  const confidence: ResearchDraft['confidence_level'] = sourcesCount >= 3 ? 'high' : sourcesCount >= 1 ? 'medium' : 'low';
  const priority: ResearchDraft['priority_level'] = composite >= 80 ? 'hot' : composite >= 60 ? 'warm' : 'standard';

  return {
    icpFit,
    signalScore,
    composite,
    priority,
    confidence,
  };
}

export function deriveIcpMeta(markdown: string): { score: number; confidence: number; verdict: string; rationale: string } {
  const text = (markdown || '').trim();
  const sourcesDetected = (text.match(/https?:\/\/\S+/g) || []).length;
  const { icpFit, confidence: confidenceBand } = computeScores(text, sourcesDetected);
  const verdict = icpFit >= 80 ? 'Excellent' : icpFit >= 65 ? 'Strong' : icpFit >= 45 ? 'Moderate' : 'Weak';
  const rationale = verdict === 'Excellent'
    ? 'High overlap with ICP priorities and strong recent activity.'
    : verdict === 'Strong'
      ? 'Most ICP signals present with solid supporting evidence.'
      : verdict === 'Moderate'
        ? 'Partial ICP alignment; investigate gaps before pursuing.'
        : 'Limited ICP alignment detected; proceed cautiously.';
  return {
    score: icpFit,
    confidence: confidenceBand === 'high' ? 90 : confidenceBand === 'medium' ? 70 : 45,
    verdict,
    rationale,
  };
}

export interface ResearchContact {
  name: string;
  title: string;
}

const CONTACT_SECTION_LABELS = [
  'Decision Makers',
  'Key Contacts',
  'Leadership & Key Contacts',
  'Leadership',
  'Buying Committee'
];

const TITLE_KEYWORDS = /(chief|ciso|security|cio|cto|technology|information|risk|compliance|privacy|trust|data|vp|vice president|svp|evp|director|head|lead|manager)/i;
const STOP_WORDS = new Set(['and', 'of', 'the', 'for', 'global', 'senior', 'team', 'head', 'lead', 'manager', 'vp', 'svp', 'evp']);

const buildTargetKeywords = (titles?: string[]): string[] => {
  if (!Array.isArray(titles) || !titles.length) return [];
  const keywords = new Set<string>();
  titles.forEach(title => {
    if (!title || typeof title !== 'string') return;
    title.toLowerCase().split(/[^a-z0-9]+/).forEach(token => {
      if (token.length >= 3 && !STOP_WORDS.has(token)) {
        keywords.add(token);
      }
    });
  });
  return Array.from(keywords);
};

export function extractDecisionMakerContacts(
  markdown: string | null | undefined,
  max = 6,
  targetTitles?: string[]
): ResearchContact[] {
  if (!markdown) return [];
  let section: string | null = null;
  for (const label of CONTACT_SECTION_LABELS) {
    section = extractSection(markdown, label);
    if (section) break;
  }
  const source = (section && section.trim().length > 0 ? section : markdown) || '';
  if (!source.trim()) return [];

  const lines = source
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^\|?\s*-{3,}\s*\|?$/i.test(line) && !/^##\s+/i.test(line));

  const contacts: ResearchContact[] = [];
  const targetKeywords = buildTargetKeywords(targetTitles);
  const hasRoleKeywords = (value?: string | null) => {
    if (!value) return false;
    if (TITLE_KEYWORDS.test(value)) {
      TITLE_KEYWORDS.lastIndex = 0;
      return true;
    }
    const lower = value.toLowerCase();
    return targetKeywords.some(keyword => lower.includes(keyword));
  };
  const sanitizeName = (value: string) => value.replace(/[*_`]/g, '').trim();
  const sanitizeTitle = (value: string) => value.replace(/[*_`]/g, '').trim();

  const addContact = (rawName?: string | null, rawTitle?: string | null) => {
    const name = sanitizeName(rawName || '');
    const title = sanitizeTitle(rawTitle || '');
    if (!name || !title || !hasRoleKeywords(title)) return;
    if (!/^[A-Z][A-Za-z' .-]+(?:\s+[A-Z][A-Za-z' .-]+)+$/.test(name)) return;
    const key = `${name.toLowerCase()}::${title.toLowerCase()}`;
    if (contacts.some(c => `${c.name.toLowerCase()}::${c.title.toLowerCase()}` === key)) return;
    contacts.push({ name, title });
  };

  const parseTableRow = (raw: string) => {
    const cells = raw.split('|').map(cell => cell.trim()).filter(Boolean);
    if (cells.length < 2) return;
    if (/^name$/i.test(cells[0])) return;
    const [name, title] = cells;
    addContact(name, title);
  };

  lines.forEach(rawLine => {
    let line = rawLine.replace(/^[-*•]\s*/, '');
    line = line.replace(/\[(.*?)\]\([^)]*\)/g, '$1').trim();
    if (!line) return;

    if (line.startsWith('|') && line.endsWith('|')) {
      parseTableRow(line);
      return;
    }

    const dashMatch = line.match(/^([A-Z][A-Za-z' .-]{1,80})\s*[—–-]\s*(.+)$/);
    if (dashMatch) {
      const [, name, titlePart] = dashMatch;
      const title = titlePart.split(/[:•-]/)[0].split(/\(/)[0].trim();
      addContact(name, title);
      return;
    }

    const parenMatch = line.match(/^([A-Z][A-Za-z' .-]{1,80})\s*\(([^)]+)\)/);
    if (parenMatch) {
      addContact(parenMatch[1], parenMatch[2]);
      return;
    }

    const commaMatch = line.match(/^([A-Z][A-Za-z' .-]{1,80})\s*,\s*([^,]+)$/);
    if (commaMatch) {
      addContact(commaMatch[1], commaMatch[2]);
      return;
    }

    const colonMatch = line.match(/^([A-Z][A-Za-z' .-]{1,80})\s*[:]\s*(.+)$/);
    if (colonMatch) {
      addContact(colonMatch[1], colonMatch[2]);
      return;
    }

    const titleNameMatch = line.match(/^(.{3,80})\s*\(([A-Z][A-Za-z' .-]{1,80})\)/);
    if (titleNameMatch) {
      const title = titleNameMatch[1].trim();
      const name = titleNameMatch[2].trim();
      addContact(name, title);
      return;
    }

    const words = line.split(/\s+-\s+/);
    if (words.length >= 2) {
      addContact(words[0], words[1]);
      return;
    }
  });

  return contacts.slice(0, max);
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
  const subject = sanitizeSubject(inferSubject(input), input);
  const markdown = input.assistantMessage.replace(ICP_META_BLOCK_REGEX, '').trim();

  const clarificationPatterns = [
    /what type of research would be most helpful\??/i,
    /do you mean the company/i,
    /what do you want researched\??/i,
    /pick from these or list your own/i,
    /i['’]ll start the web search once you confirm/i,
    /objective \(why you need it\)/i,
    /timeframe \(e\.g\./i,
    /deliverable \(brief summary, detailed report, slide bullets\)/i,
    /depth \(quick \/ medium \/ deep\)/i,
    /any sources to include or exclude/i,
    /quick question before i start/i,
    /choose research type/i
  ];
  const isClarification = clarificationPatterns.some(pattern => pattern.test(markdown));

  // If no captured sources from reasoning/search, attempt to extract first URL from markdown
  if (normalizedSources.length === 0) {
    const firstUrl = (markdown.match(/https?:\/\/[^\s)]+/i) || [])[0];
    if (firstUrl) {
      normalizedSources = [{ url: firstUrl }];
    }
  }

  if (isClarification || (!/##\s+/.test(markdown) && normalizedSources.length === 0 && markdown.length < 400)) {
    return {
      subject,
      research_type: researchType,
      executive_summary: '',
      markdown_report: '',
      icp_fit_score: undefined,
      signal_score: undefined,
      composite_score: undefined,
      priority_level: undefined,
      confidence_level: undefined,
      sources: [],
      company_data: {},
      leadership_team: [],
      buying_signals: [],
      custom_criteria_assessment: [],
      personalization_points: [],
      recommended_actions: {},
    };
  }

  const executiveSummary = buildSummary(markdown);
  const stripExecSection = (md: string): string => {
    // Remove canonical section
    let out = md.replace(/^##\s+Executive Summary\s*[\r\n]+[\s\S]*?(?=^##\s+|$)/gim, '').trim();
    // Remove alt headings like "Company — Executive Summary"
    out = out.replace(/^#{1,3}\s+.*?executive\s+summary.*?[\r\n]+[\s\S]*?(?=^#{1,3}\s+|$)/gim, '').trim();
    return out;
  };
  const cleanedMarkdown = stripExecSection(markdown);
  const adjustedMarkdown = applyIndicatorTerminology(cleanedMarkdown, input.userProfile || null);
  const companyData = extractCompanyData(markdown);
  const { icpFit, signalScore, composite, priority, confidence } = computeScores(markdown, normalizedSources.length);

  return {
    subject,
    research_type: researchType,
    executive_summary: executiveSummary,
    markdown_report: adjustedMarkdown,
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

export function applyIndicatorTerminology(markdown: string, profile?: Partial<UserProfile> | null): string {
  if (!markdown) return markdown;
  const terms = profile?.preferred_terms as Record<string, any> | undefined | null;
  const rawLabel =
    terms && typeof terms === 'object' && typeof terms.indicators_label === 'string'
      ? terms.indicators_label.trim()
      : '';
  const rawChoices = Array.isArray(profile?.indicator_choices) ? profile?.indicator_choices : [];
  const indicatorChoices = rawChoices
    .map(choice => (typeof choice === 'string' ? choice.trim() : ''))
    .filter(choice => choice.length > 0);
  if (!rawLabel && indicatorChoices.length === 0) {
    return markdown;
  }
  const sectionLabel = rawLabel || 'Indicators';
  const headingRegex = /^##\s+(.+?)\s*$/gim;
  type SectionMeta = { title: string; start: number; end: number };
  const sections: SectionMeta[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(markdown)) !== null) {
    const title = match[1];
    const start = match.index;
    const end = headingRegex.lastIndex;
    sections.push({ title, start, end });
  }

  const normalizeTitle = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const desired = normalizeTitle(sectionLabel);
  const targetIndex = sections.findIndex(section => {
    const normal = normalizeTitle(section.title);
    if (normal === desired) return true;
    if (normal.includes('signal')) return true;
    if (normal.includes('indicator')) return true;
    if (normal.includes('trigger')) return true;
    return false;
  });

  if (targetIndex === -1) {
    if (indicatorChoices.length === 0) return markdown;
    const newSectionLines = [`## ${sectionLabel}`, ...indicatorChoices.map(choice => `- ${choice}`)];
    const appendBlock = `${markdown.trim()}\n\n${newSectionLines.join('\n')}\n`;
    return appendBlock;
  }

  const target = sections[targetIndex];
  const nextSection = sections[targetIndex + 1];
  const headingStart = target.start;
  const headingEnd = target.end;
  const contentStart = headingEnd;
  const contentEnd = nextSection ? nextSection.start : markdown.length;

  const beforeSection = markdown.slice(0, headingStart);
  const afterSection = markdown.slice(contentEnd);
  const originalContent = markdown.slice(contentStart, contentEnd);
  const contentWithoutLead = originalContent.replace(/^\s+/, '');
  const indicatorSet = new Set(indicatorChoices.map(choice => choice.toLowerCase()));
  const filteredExisting = contentWithoutLead
    .split('\n')
    .filter(line => {
      const matchLine = line.trim();
      const bulletMatch = /^[-*]\s*(.+)$/.exec(matchLine);
      if (!bulletMatch) return true;
      const normalized = bulletMatch[1].trim().toLowerCase();
      return !indicatorSet.has(normalized);
    })
    .join('\n')
    .trim();

  const parts: string[] = [];
  if (indicatorChoices.length > 0) {
    parts.push(indicatorChoices.map(choice => `- ${choice}`).join('\n'));
  }
  if (filteredExisting) {
    parts.push(filteredExisting);
  }

  const sectionBody = parts.join('\n\n');
  const rebuiltSection = `## ${sectionLabel}\n${sectionBody ? `${sectionBody}\n` : ''}`;

  return `${beforeSection}${rebuiltSection}${afterSection.startsWith('\n') ? '' : '\n'}${afterSection}`;
}
