export interface CreditEstimate {
  min: number;
  max: number;
  description: string;
}

export function estimateCredits(query: string): CreditEstimate {
  const lowerQuery = query.toLowerCase();

  // Account tracking patterns
  if (lowerQuery.includes('track') || lowerQuery.includes('monitor') || lowerQuery.includes('add to')) {
    const companyCount = (query.match(/,/g) || []).length + 1;
    return {
      min: 2,
      max: 5,
      description: companyCount > 1 ? `Track ${companyCount} companies` : 'Track company'
    };
  }

  // Account management queries
  if (lowerQuery.includes('which accounts') || lowerQuery.includes('my accounts') || lowerQuery.includes('show accounts')) {
    return {
      min: 10,
      max: 20,
      description: 'Account portfolio query'
    };
  }

  // Batch research on tracked accounts
  if ((lowerQuery.includes('refresh') || lowerQuery.includes('update')) && lowerQuery.includes('account')) {
    return {
      min: 100,
      max: 300,
      description: 'Batch account research'
    };
  }

  // Company research patterns (single company)
  if (lowerQuery.includes('research') || lowerQuery.match(/\b(boeing|lockheed|raytheon|northrop|general dynamics)\b/i)) {
    // Check for depth indicators
    const isDeep = lowerQuery.includes('deep') || lowerQuery.includes('comprehensive') || lowerQuery.includes('detailed');
    const isQuick = lowerQuery.includes('quick') || lowerQuery.includes('brief') || lowerQuery.includes('summary');
    
    if (isDeep) {
      return { min: 50, max: 80, description: 'Deep intelligence research' };
    } else if (isQuick) {
      return { min: 20, max: 40, description: 'Quick brief research' };
    }
    return { min: 40, max: 60, description: 'Company research' };
  }

  // Prospect discovery patterns
  if ((lowerQuery.includes('find') || lowerQuery.includes('discover') || lowerQuery.includes('list')) &&
      (lowerQuery.includes('prospect') || lowerQuery.includes('companies') || lowerQuery.includes('leads'))) {
    const numberMatch = query.match(/\d+/);
    const count = numberMatch ? parseInt(numberMatch[0]) : 10;
    return {
      min: Math.min(count * 15, 500),
      max: Math.min(count * 25, 800),
      description: `${count} companies with enrichment`
    };
  }

  // Competitor analysis patterns
  if (lowerQuery.includes('competitor') || lowerQuery.includes('compare') || lowerQuery.includes('versus')) {
    const count = (query.match(/,/g) || []).length + 1;
    return {
      min: count * 30,
      max: count * 50,
      description: `${count} competitor analysis`
    };
  }

  // Market trends/intelligence patterns
  if (lowerQuery.includes('trend') || lowerQuery.includes('market') || lowerQuery.includes('industry')) {
    return {
      min: 60,
      max: 100,
      description: 'Market intelligence report'
    };
  }

  // Profile updates (Company Profiler)
  if (lowerQuery.includes('update') && (lowerQuery.includes('profile') || lowerQuery.includes('icp'))) {
    return {
      min: 5,
      max: 15,
      description: 'Profile update conversation'
    };
  }

  // Clarification/simple responses
  if (lowerQuery.length < 20 && (lowerQuery.includes('yes') || lowerQuery.includes('no') || lowerQuery.includes('deep') || lowerQuery.includes('quick'))) {
    return {
      min: 1,
      max: 3,
      description: 'Simple response'
    };
  }

  // Default estimation for general queries
  return {
    min: 20,
    max: 40,
    description: 'General query'
  };
}

export function formatCreditRange(estimate: CreditEstimate): string {
  if (estimate.min === estimate.max) {
    return `~${estimate.min} credits`;
  }
  return `${estimate.min}-${estimate.max} credits`;
}
