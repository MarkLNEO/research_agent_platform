export function normalizeMarkdown(raw: string): string {
  let text = raw || '';

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

  const clarifierPatterns: RegExp[] = [
    /Do you mean the company[^?]+\?[\s\S]*?(Which do you want\?|If you want research|Also specify depth)/gi,
    /If you want research[^\.]*\.[\s\S]*?(Which do you want\?|Example request you can copy|Also specify depth)/gi,
    /Pick one of these and give a date range and depth[^\.]*\.[\s\S]*?(Which do you want\?|Also specify depth)/gi,
    /Tell me what you want to learn and pick scope:[\s\S]*?(Also specify depth|Which do you want\?)/gi,
    /Do you mean the company\/product[^?]+\?[\s\S]*?(?=\n##\s+Key Findings|\nKey Findings|$)/gi
  ];
  for (const pattern of clarifierPatterns) {
    text = text.replace(pattern, '');
  }

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Normalize common plain-text headers into markdown headings
  const headingMap: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /^\s*Executive summary(?:\s*\(.*?\))?\s*$/gim, replacement: '## Executive Summary' },
    { pattern: /^\s*Executive Summary(?:\s*\(.*?\))?\s*$/gim, replacement: '## Executive Summary' },
    { pattern: /^\s*TL;?\s*DR\.?\s*$/gim, replacement: '## High Level' },
    { pattern: /^\s*High\s*Level:?$/gim, replacement: '## High Level' },
    { pattern: /^\s*Key facts?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Key Findings' },
    { pattern: /^\s*Key findings?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Key Findings' },
    { pattern: /^\s*Signals?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Signals' },
    { pattern: /^\s*Recommended next steps?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Recommended Next Actions' },
    { pattern: /^\s*Tech(?:\s*\/\s*footprint)?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Tech/Footprint' },
    { pattern: /^\s*Operating footprint(?:\s*\(.*?\))?\s*$/gim, replacement: '## Tech/Footprint' },
    { pattern: /^\s*Decision makers?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Decision Makers' },
    { pattern: /^\s*Sources?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Sources' },
    { pattern: /^\s*Recommended next actions?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Recommended Next Actions' },
    { pattern: /^\s*Risks? & gaps?(?:\s*\(.*?\))?\s*$/gim, replacement: '## Risks & Gaps' }
  ];

  for (const { pattern, replacement } of headingMap) {
    text = text.replace(pattern, replacement);
  }

  // Ensure a top-level headline exists; promote first Executive Summary heading to H1 if needed
  if (!/^#\s+/m.test(text)) {
    if (/^##\s+Executive Summary/m.test(text)) {
      text = text.replace(/^##\s+Executive Summary/m, '# Executive Summary');
    } else {
      text = `# Executive Summary\n\n${text.trimStart()}`;
    }
  }

  // Ensure High Level section exists; if missing, add placeholder after headline
  if (!/^##\s+High Level/m.test(text)) {
    text = text.replace(/^#\s.+$/m, (match) => `${match}\n\n## High Level\n- No high-level summary provided yet.\n`);
    if (!/^##\s+High Level/m.test(text)) {
      text = `${text.trim()}\n\n## High Level\n- No high-level summary provided yet.\n`;
    }
  }

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
    if (!new RegExp(`^#{1,3}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'mi').test(text)) {
      text = text.replace(label, `\n## ${heading}\n`);
    }
  };
  ensureHeading(/^\s*summary\s*\n/mi, 'Executive Summary');
  ensureHeading(/^\s*recent\s+signals[\s:]*\n/mi, 'Recent Signals');
  ensureHeading(/^\s*(?:next\s+actions|recommended\s+next\s+actions)[\s:]*\n/mi, 'Recommended Next Actions');
  ensureHeading(/^\s*(?:tech\s*\/\s*footprint|tech|footprint)[\s:]*\n/mi, 'Tech/Footprint');
  if (!/\n##\s+Sources\n/i.test(text) && /https?:\/\//.test(text)) {
    text += `\n\n## Sources\n` + Array.from(new Set(Array.from(text.matchAll(/https?:[^\s)\]]+/g)).map(m => m[0]))).slice(0, 8).map(u => `- ${u}`).join('\n');
  }

  return text;
}
