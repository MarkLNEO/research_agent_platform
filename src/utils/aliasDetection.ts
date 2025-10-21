export function extractAliasCandidates(text: string): string[] {
  if (!text) return [];
  const tokens = new Set<string>();
  const regex = /\b[0-9A-Za-z][0-9A-Za-z\-\+\._/]{1,}\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const term = match[0];
    if (!term) continue;
    if (term.length < 3 || term.length > 48) continue;
    const hasDigit = /\d/.test(term);
    const hasUpper = /[A-Z]/.test(term);
    if (!hasDigit && !hasUpper) continue;
    tokens.add(term);
  }
  return Array.from(tokens).slice(0, 12);
}

export function detectAliasAffirmations(message: string): Array<{ canonical: string; alias: string }> {
  const results: Array<{ canonical: string; alias: string }> = [];
  if (!message) return results;
  const pattern = /"?([A-Za-z0-9][A-Za-z0-9\s\-\+\/&]{1,})"?\s*(?:=|is|equals|means)\s*"?([A-Za-z0-9][A-Za-z0-9\s\-\+\/&]{1,})"?/gi;
  const normalize = (value: string) => {
    let term = value.trim().replace(/[.,!?]+$/, '');
    const clipped = term.split(/\s+(?:in|for|with|within|on|at|which|that)\b/i)[0];
    return clipped.trim();
  };
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message))) {
    const left = normalize(match[1]);
    const right = normalize(match[2]);
    if (!left || !right || left.toLowerCase() === right.toLowerCase()) continue;
    const leftScore = left.split(/\s+/).length + (/[0-9]/.test(left) ? 1.5 : 0);
    const rightScore = right.split(/\s+/).length + (/[0-9]/.test(right) ? 1.5 : 0);
    const canonical = rightScore >= leftScore ? right : left;
    const alias = canonical === right ? left : right;
    if (alias.length <= 40 && canonical.length <= 80) {
      results.push({ canonical, alias });
    }
  }
  return results;
}
