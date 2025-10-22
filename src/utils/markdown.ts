const CLARIFIER_PATTERNS: RegExp[] = [
  /Do you mean[^?]+\?[\s\S]*?(Which do you want\?|Which scope|If you want research|What exactly do you want|Do you want researched|Also specify depth)/gi,
  /Do you mean[^?]+\?[\s\S]*?Tell me which items to research[^\n]*\n?/gi,
  /Do you mean[^?]+\?[\s\S]*?(?=(?:##\s+Key Findings|\nKey Findings|##\s+Signals|\nSignals|##\s+Detailed Findings|\nDetailed Findings|Detailed Findings|Retry|Agent can make mistakes|$))/gi,
  /What specifically do you want researched[—-]?[\s\S]*?(?=(?:##\s+Key Findings|\nKey Findings|##\s+Signals|\nSignals|##\s+Detailed Findings|\nDetailed Findings|Detailed Findings|Retry|Agent can make mistakes|$))/gi,
  /What exactly do you want researched[—-]?[\s\S]*?(?=(?:##\s+Key Findings|\nKey Findings|##\s+Signals|\nSignals|##\s+Detailed Findings|\nDetailed Findings|Detailed Findings|Retry|Agent can make mistakes|$))/gi,
  /If you want research[^\n]*\n[\s\S]*?(?=(?:##\s+Key Findings|\nKey Findings|##\s+Signals|\nSignals|##\s+Detailed Findings|\nDetailed Findings|Detailed Findings|Retry|Agent can make mistakes|$))/gi,
  /If you want research[^.]*\.[\s\S]*?(Which do you want\?|Example request you can copy|Also specify depth)/gi,
  /Pick one of these and give a date range and depth[^.]*\.[\s\S]*?(Which do you want\?|Also specify depth)/gi,
  /Tell me what you want to learn and pick scope:[\s\S]*?(Also specify depth|Which do you want\?)/gi,
  /Do you mean the company\/product[^?]+\?[\s\S]*?(?=\n##\s+Key Findings|\nKey Findings|\nDetailed Findings|Detailed Findings|$)/gi,
  /If useful, copy[^\n]*request template[\s\S]*?(?=(?:##\s+Key Findings|\nKey Findings|##\s+Signals|\nSignals|Detailed Findings|Retry|Agent can make mistakes|$))/gi,
  /Which scope, time window, depth, and format do you want\?[\s\S]*?(?=(?:##\s+Key Findings|\nKey Findings|##\s+Signals|\nSignals|Detailed Findings|Retry|Agent can make mistakes|$))/gi
];

export function stripClarifierBlocks(raw: string): string {
  let text = raw || '';
  for (const pattern of CLARIFIER_PATTERNS) {
    text = text.replace(pattern, '');
  }
  text = text.replace(/Do you mean[\s\S]*?(?=\n##\s+|\n[A-Z][^\n]*\n|Retry|Agent can make mistakes|$)/gi, '\n');
  text = text.replace(/If useful, copy[^\n]*request template[\s\S]*?(?=\n##\s+|\n[A-Z][^\n]*\n|Retry|Agent can make mistakes|$)/gi, '\n');
  text = text.replace(/Which scope, time window, depth, and format do you want\?[\s\S]*?(?=\n##\s+|\n[A-Z][^\n]*\n|Retry|Agent can make mistakes|$)/gi, '\n');
  text = text.replace(/^[ \t]*[^\n]*pick from:[^\n]*\n?/gim, '');
  text = text.replace(/^[ \t]*"Research [^\n]+\n?/gim, '');
  text = text.replace(/^[ \t]*Timeframe.*\n?/gim, '');
  text = text.replace(/^[ \t]*Level of detail.*\n?/gim, '');
  text = text.replace(/^[ \t]*Whether to perform a web search.*\n?/gim, '');
  text = text.replace(/Added signal\(s\):\s*([^\n]+)\n\s*Currently tracking:\s*\1/gi, (_match, list) => `Tracking signals: ${list.trim()}`);
  // Normalize inline "High Level" placeholders that were streamed without headings.
  text = text.replace(/(^|\n)High Level\s+No high[- ]level summary provided yet\.?/gi, '$1## High Level\n- No high-level summary provided yet.\n');
  return text;
}

export function normalizeMarkdown(raw: string, opts?: { enforceResearchSections?: boolean }): string {
  const enforce = opts?.enforceResearchSections !== false; // default true for research flows
  let text = stripClarifierBlocks(raw || '');

  // Convert plain-text bullets (• or –) to markdown dashes when used as list items
  // Skip code fences
  (() => {
    const lines = text.split('\n');
    let inCode = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line.trim())) {
        inCode = !inCode; continue;
      }
      if (inCode) continue;
      if (/^\s*[•\u2022\-\u2013]\s+/.test(line)) {
        lines[i] = line.replace(/^\s*[•\u2022\-\u2013]\s+/, '- ');
      }
    }
    text = lines.join('\n');
  })();

  // Renumber ordered lists correctly without clobbering existing numbering.
  // - Works across multiple lists
  // - Preserves indentation and delimiter ("." or ")")
  // - Skips code fences
  const renumberOrderedLists = (md: string) => {
    const lines = md.split('\n');
    let inCode = false;
    let prevWasOrdered = false;
    let currentIndent = '';
    let counter = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line.trim())) {
        inCode = !inCode;
        // any list should end when entering/leaving code fences
        prevWasOrdered = false;
        currentIndent = '';
        counter = 0;
        continue;
      }
      if (inCode) continue;

      const m = line.match(/^(\s{0,3})(\d+)([.)])\s+(.*)$/);
      if (m) {
        const indent = m[1];
        const delim = m[3];
        const rest = m[4];
        if (!prevWasOrdered || indent !== currentIndent) {
          // start new list
          currentIndent = indent;
          counter = 1;
        } else {
          counter += 1;
        }
        lines[i] = `${indent}${counter}${delim} ${rest}`;
        prevWasOrdered = true;
      } else {
        // blank line or non-ordered line ends current list sequence
        prevWasOrdered = false;
        currentIndent = '';
        counter = 0;
      }
    }
    return lines.join('\n');
  };

  text = renumberOrderedLists(text);

  if (enforce) {
    // If a High Level section still contains clarifier-style prompts, replace with default placeholder.
    text = text.replace(/(^##\s+High Level[\s\S]*?)(?=^##\s+|$)/gim, (section) => {
      if (/do you mean/i.test(section) || /what do you want/i.test(section)) {
        return '## High Level\n- No high-level summary provided yet.\n';
      }
      return section;
    });
  }

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Normalize common plain-text headers into markdown headings
  const headingMap: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /^\s*Executive summary(?:\s*\(.*?\))?\s*$/gim, replacement: '## Executive Summary' },
    { pattern: /^\s*Executive Summary(?:\s*\(.*?\))?\s*$/gim, replacement: '## Executive Summary' },
    { pattern: /^\s*TL;?\s*DR\.?\s*$/gim, replacement: '## TL;DR' },
    { pattern: /^\s*High\s*Level:?$/gim, replacement: '## High Level' },
    { pattern: /^\s*Key facts?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Key Findings' },
    { pattern: /^\s*Key findings?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Key Findings' },
    { pattern: /^\s*Detailed findings?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Key Findings' },
    { pattern: /^\s*Signals?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Signals' },
    { pattern: /^\s*Recommended next steps?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Recommended Next Actions' },
    { pattern: /^\s*Tech(?:\s*\/\s*footprint)?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Tech/Footprint' },
    { pattern: /^\s*Operating footprint(?:\s*\(.*?\))?\s*$/gim, replacement: '## Tech/Footprint' },
    { pattern: /^\s*Decision makers?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Decision Makers' },
    { pattern: /^\s*Sources?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Sources' },
    { pattern: /^\s*Recommended next actions?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Recommended Next Actions' },
    { pattern: /^\s*Risks? & gaps?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Risks & Gaps' }
  ];

  if (enforce) {
    for (const { pattern, replacement } of headingMap) {
      text = text.replace(pattern, replacement);
    }
  }

  const headingMatches = Array.from(text.matchAll(/^##\s+(.+?)\s*$/gm)).map((match) => match[1].trim());
  const DEFAULT_SECTIONS = new Set([
    'Executive Summary',
    'High Level',
    'TL;DR',
    'Recent Signals',
    'Key Findings',
    'Custom Criteria',
    'Signals',
    'Recommended Next Actions',
    'Tech/Footprint',
    'Operating Footprint',
    'Decision Makers',
    'Risks & Gaps',
    'Sources',
    'Proactive Follow-ups',
    'Saved Follow-up Answers'
  ]);
  const usesCustomTemplate = headingMatches.some((heading) => !DEFAULT_SECTIONS.has(heading));

  if (enforce) {
    // Ensure a top-level headline exists; promote first Executive Summary heading to H1 if needed
    if (!/^#\s+/m.test(text)) {
      if (/^##\s+Executive Summary/m.test(text)) {
        text = text.replace(/^##\s+Executive Summary/m, '# Executive Summary');
      } else {
        text = `# Executive Summary\n\n${text.trimStart()}`;
      }
    }
  }

  if (enforce) {
    // Ensure High Level section exists; if missing, add placeholder after headline
    if (!/^##\s+High Level/m.test(text) && !usesCustomTemplate) {
      text = text.replace(/^#\s.+$/m, (match) => `${match}\n\n## High Level\n- No high-level summary provided yet.\n`);
      if (!/^##\s+High Level/m.test(text)) {
        text = `${text.trim()}\n\n## High Level\n- No high-level summary provided yet.\n`;
      }
    }
  }

  if (enforce && !usesCustomTemplate) {
    // Ensure other key sections exist; append placeholders if absent
    const requiredSections = ['Key Findings', 'Signals', 'Recommended Next Actions'];
    for (const section of requiredSections) {
      const heading = `## ${section}`;
      if (!new RegExp(`^${escapeRegExp(heading)}`, 'mi').test(text)) {
        text = `${text.trim()}\n\n${heading}\nNone found.`;
      }
    }

    // Promote common section labels to proper headings if strict headings are missing
    const ensureHeading = (label: RegExp, heading: string) => {
      const escaped = escapeRegExp(heading);
      if (!new RegExp(`^#{1,3}\\s+${escaped}`, 'mi').test(text)) {
        text = text.replace(label, `\n## ${heading}\n`);
      }
    };
    ensureHeading(/^\s*summary\s*\n/mi, 'Executive Summary');
    ensureHeading(/^\s*recent\s+signals[\s:]*\n/mi, 'Recent Signals');
    ensureHeading(/^\s*(?:next\s+actions|recommended\s+next\s+actions)[\s:]*\n/mi, 'Recommended Next Actions');
    ensureHeading(/^\s*(?:tech\s*\/\s*footprint|tech|footprint)[\s:]*\n/mi, 'Tech/Footprint');
  }
  if (enforce && !/\n##\s+Sources\n/i.test(text) && /https?:\/\//.test(text)) {
    text += `\n\n## Sources\n` + Array.from(new Set(Array.from(text.matchAll(/https?:[^\s)\]]+/g)).map(m => m[0]))).slice(0, 8).map(u => `- ${u}`).join('\n');
  }

  // Humanize internal field names that may leak into assistant text
  // Keep replacements conservative and outside of code fences (already stripped/normalized above)
  const HUMANIZE_MAP: Array<{ pattern: RegExp; to: string }> = [
    { pattern: /\btarget_titles\b/gi, to: 'target titles' },
    { pattern: /\bsignal_preferences\b/gi, to: 'signal alerts' },
    { pattern: /\bindicator_choices\b/gi, to: 'watch-list items' },
    { pattern: /\bpreferred_terms\.indicators_label\b/gi, to: 'your preferred term for signals' },
  ];
  for (const { pattern, to } of HUMANIZE_MAP) {
    text = text.replace(pattern, to);
  }

  return text;
}
