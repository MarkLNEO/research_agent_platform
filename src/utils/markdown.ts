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
