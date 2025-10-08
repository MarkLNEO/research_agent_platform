/**
 * Context Builder for GPT-5 Prompts
 *
 * Ensures correct field mapping between database structure and prompts
 */

import { UserContext } from '../types';

/**
 * Build formatted user context for prompts
 */
export function buildUserContextString(context: UserContext): string {
  const { profile, customCriteria, signals, disqualifiers } = context;

  const sections: string[] = [];

  // Company Information
  if (profile?.company_name) {
    sections.push(`Company: ${profile.company_name}`);
  }
  if (profile?.company_url) {
    sections.push(`Website: ${profile.company_url}`);
  }
  if (profile?.industry) {
    sections.push(`Industry: ${profile.industry}`);
  }

  // User Information
  if (profile?.user_role) {
    sections.push(`User Role: ${profile.user_role}`);
  }
  if (profile?.use_case) {
    sections.push(`Use Case: ${profile.use_case}`);
  }

  // ICP Definition
  if (profile?.icp_definition) {
    sections.push(`ICP: ${profile.icp_definition.slice(0, 150)}${profile.icp_definition.length > 150 ? '...' : ''}`);
  }

  // Target Audience
  if (profile?.target_titles?.length) {
    sections.push(`Target Titles: ${profile.target_titles.join(', ')}`);
  }
  if (profile?.seniority_levels?.length) {
    sections.push(`Seniority: ${profile.seniority_levels.join(', ')}`);
  }
  if (profile?.target_departments?.length) {
    sections.push(`Departments: ${profile.target_departments.join(', ')}`);
  }

  // Competitors
  if (profile?.competitors?.length) {
    sections.push(`Competitors: ${profile.competitors.join(', ')}`);
  }

  // Custom Criteria Summary
  if (customCriteria?.length > 0) {
    const criticalCount = customCriteria.filter(c => c.importance === 'critical').length;
    const importantCount = customCriteria.filter(c => c.importance === 'important').length;
    sections.push(`Criteria: ${criticalCount} critical, ${importantCount} important, ${customCriteria.length} total`);
  }

  // Signals Summary
  if (signals?.length > 0) {
    const signalTypes = signals.map(s => s.signal_type).slice(0, 3).join(', ');
    sections.push(`Tracking Signals: ${signalTypes}${signals.length > 3 ? ` +${signals.length - 3} more` : ''}`);
  }

  // Disqualifiers Summary
  if (disqualifiers?.length > 0) {
    sections.push(`Disqualifiers: ${disqualifiers.length} defined`);
  }

  return sections.length > 0
    ? sections.join('\n')
    : 'No user context configured - consider setting up your profile for better results';
}

/**
 * Build detailed criteria section for prompts
 */
export function buildCriteriaSection(context: UserContext): string {
  const { customCriteria } = context;

  if (!customCriteria || customCriteria.length === 0) {
    return 'No custom criteria defined';
  }

  const sections: string[] = ['QUALIFYING CRITERIA:'];

  // Group by importance
  const critical = customCriteria.filter(c => c.importance === 'critical');
  const important = customCriteria.filter(c => c.importance === 'important');
  const niceToHave = customCriteria.filter(c => c.importance === 'nice_to_have');

  if (critical.length > 0) {
    sections.push('\nCritical (Must Have):');
    critical.forEach(c => {
      sections.push(`- ${c.field_name} (${c.field_type})`);
      if (c.hints?.length) {
        sections.push(`  Hints: ${c.hints.join(', ')}`);
      }
    });
  }

  if (important.length > 0) {
    sections.push('\nImportant (Should Have):');
    important.forEach(c => {
      sections.push(`- ${c.field_name} (${c.field_type})`);
    });
  }

  if (niceToHave.length > 0) {
    sections.push('\nNice to Have:');
    niceToHave.forEach(c => {
      sections.push(`- ${c.field_name} (${c.field_type})`);
    });
  }

  return sections.join('\n');
}

/**
 * Build signals section for prompts
 */
export function buildSignalsSection(context: UserContext): string {
  const { signals } = context;

  if (!signals || signals.length === 0) {
    return 'No buying signals configured';
  }

  const sections: string[] = ['BUYING SIGNALS TO DETECT:'];

  signals.forEach(signal => {
    sections.push(`- ${signal.signal_type} (${signal.importance}, last ${signal.lookback_days} days)`);
    if (signal.config && Object.keys(signal.config).length > 0) {
      sections.push(`  Config: ${JSON.stringify(signal.config)}`);
    }
  });

  return sections.join('\n');
}

/**
 * Build disqualifiers section for prompts
 */
export function buildDisqualifiersSection(context: UserContext): string {
  const { disqualifiers } = context;

  if (!disqualifiers || disqualifiers.length === 0) {
    return 'No disqualifying criteria set';
  }

  const sections: string[] = ['DISQUALIFYING CRITERIA (Auto-skip if found):'];

  disqualifiers.forEach(d => {
    sections.push(`- ${d.criterion}`);
  });

  return sections.join('\n');
}

/**
 * Build complete context for a prompt
 */
export function buildCompleteContext(context: UserContext, options?: {
  includeProfile?: boolean;
  includeCriteria?: boolean;
  includeSignals?: boolean;
  includeDisqualifiers?: boolean;
}): string {
  const opts = {
    includeProfile: true,
    includeCriteria: true,
    includeSignals: true,
    includeDisqualifiers: true,
    ...options
  };

  const sections: string[] = [];

  if (opts.includeProfile) {
    sections.push('USER CONTEXT:');
    sections.push(buildUserContextString(context));
  }

  if (opts.includeCriteria && context.customCriteria?.length > 0) {
    sections.push('\n' + buildCriteriaSection(context));
  }

  if (opts.includeSignals && context.signals?.length > 0) {
    sections.push('\n' + buildSignalsSection(context));
  }

  if (opts.includeDisqualifiers && context.disqualifiers?.length > 0) {
    sections.push('\n' + buildDisqualifiersSection(context));
  }

  return sections.join('\n');
}

/**
 * Extract key search terms from user context for web searches
 */
export function extractSearchTerms(context: UserContext): string[] {
  const terms: string[] = [];

  if (context.profile?.industry) {
    terms.push(context.profile.industry);
  }

  if (context.profile?.competitors?.length) {
    terms.push(...context.profile.competitors.slice(0, 2));
  }

  if (context.profile?.target_titles?.length) {
    terms.push(context.profile.target_titles[0]);
  }

  // Extract key terms from ICP definition
  if (context.profile?.icp_definition) {
    const keywords = context.profile.icp_definition
      .match(/\b[A-Z][a-z]+\b/g)
      ?.slice(0, 3) || [];
    terms.push(...keywords);
  }

  return [...new Set(terms)]; // Remove duplicates
}