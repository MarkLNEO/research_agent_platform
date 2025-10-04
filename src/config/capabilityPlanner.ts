export interface CapabilityProvider {
  name: string;
  label: string;
  cost: 'low' | 'medium' | 'high';
  reliability: 'low' | 'medium' | 'high';
  latency: 'low' | 'medium' | 'high';
  supports_airgapped?: boolean;
  notes?: string;
}

export interface CapabilityDefinition {
  id: string;
  label: string;
  description: string;
  providers: CapabilityProvider[];
  policy?: {
    prefer?: 'reliability' | 'cost' | 'latency';
    fallback?: 'reliability' | 'cost' | 'latency';
  };
}

export interface CapabilityPlanItem {
  capability: CapabilityDefinition;
  preferred: CapabilityProvider;
  fallbacks: CapabilityProvider[];
}

export interface CapabilityPlan {
  items: CapabilityPlanItem[];
  notes: string[];
}

export const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  {
    id: 'web_search',
    label: 'Web Search',
    description: 'General purpose web search across trusted indices.',
    providers: [
      {
        name: 'serp_api',
        label: 'SerpAPI',
        cost: 'medium',
        reliability: 'high',
        latency: 'medium',
        notes: 'Battle-tested web search API.'
      },
      {
        name: 'bing_web',
        label: 'Bing Web Search',
        cost: 'medium',
        reliability: 'high',
        latency: 'medium'
      },
      {
        name: 'airgap_web_index',
        label: 'Air-gapped Index',
        cost: 'high',
        reliability: 'medium',
        latency: 'high',
        supports_airgapped: true,
        notes: 'Offline mirror used for regulated deployments.'
      }
    ],
    policy: {
      prefer: 'reliability',
      fallback: 'cost'
    }
  },
  {
    id: 'news_search',
    label: 'News Search',
    description: 'Recent news and press releases.',
    providers: [
      {
        name: 'newsapi',
        label: 'NewsAPI',
        cost: 'medium',
        reliability: 'medium',
        latency: 'low'
      },
      {
        name: 'gdeltnext',
        label: 'GDELT Next',
        cost: 'low',
        reliability: 'medium',
        latency: 'medium'
      }
    ],
    policy: {
      prefer: 'latency',
      fallback: 'reliability'
    }
  },
  {
    id: 'linkedin_people',
    label: 'Company People',
    description: 'Leadership and people intelligence.',
    providers: [
      {
        name: 'proxycurl',
        label: 'Proxycurl',
        cost: 'medium',
        reliability: 'high',
        latency: 'low'
      },
      {
        name: 'page_parser_leadership',
        label: "Web Fetch + Leadership Parser",
        cost: 'low',
        reliability: 'medium',
        latency: 'medium'
      }
    ],
    policy: {
      prefer: 'reliability',
      fallback: 'cost'
    }
  },
  {
    id: 'tech_stack_lookup',
    label: 'Technology Footprint',
    description: 'Detects underlying tools and infrastructure.',
    providers: [
      {
        name: 'builtwith',
        label: 'BuiltWith',
        cost: 'medium',
        reliability: 'medium',
        latency: 'medium'
      },
      {
        name: 'wappalyzer',
        label: 'Wappalyzer',
        cost: 'low',
        reliability: 'medium',
        latency: 'low'
      }
    ]
  },
  {
    id: 'financials_fetch',
    label: 'Financial Data',
    description: 'Pulls revenue estimates, funding, and key ratios.',
    providers: [
      {
        name: 'crunchbase',
        label: 'Crunchbase',
        cost: 'high',
        reliability: 'high',
        latency: 'medium'
      },
      {
        name: 'sec_edgar',
        label: 'SEC EDGAR',
        cost: 'low',
        reliability: 'high',
        latency: 'high'
      }
    ],
    policy: {
      prefer: 'reliability',
      fallback: 'latency'
    }
  },
  {
    id: 'breach_monitor',
    label: 'Breach Monitor',
    description: 'Aggregates breach disclosures and dark web chatter.',
    providers: [
      {
        name: 'have_i_been_pwned',
        label: 'HaveIBeenPwned',
        cost: 'low',
        reliability: 'medium',
        latency: 'low'
      },
      {
        name: 'darkscan',
        label: 'Darkscan (managed service)',
        cost: 'high',
        reliability: 'high',
        latency: 'medium',
        supports_airgapped: true
      }
    ]
  },
  {
    id: 'compliance_registry',
    label: 'Compliance Registry',
    description: 'Certifications, attestations, and compliance filings.',
    providers: [
      {
        name: 'certify',
        label: 'CertifyHub',
        cost: 'medium',
        reliability: 'medium',
        latency: 'medium'
      },
      {
        name: 'sam_gov',
        label: 'SAM.gov',
        cost: 'low',
        reliability: 'high',
        latency: 'medium'
      }
    ]
  },
  {
    id: 'clinical_trials_registry',
    label: 'Clinical Trials Registry',
    description: 'Clinical trials data and sponsor filings.',
    providers: [
      {
        name: 'clinicaltrials_gov',
        label: 'ClinicalTrials.gov',
        cost: 'low',
        reliability: 'high',
        latency: 'medium'
      },
      {
        name: 'global_trials_index',
        label: 'Global Trials Index',
        cost: 'medium',
        reliability: 'medium',
        latency: 'medium',
        supports_airgapped: true
      }
    ]
  },
  {
    id: 'sam_gov',
    label: 'SAM.gov Contracts',
    description: 'Federal contract registrations and status.',
    providers: [
      {
        name: 'sam_api',
        label: 'SAM.gov API',
        cost: 'low',
        reliability: 'high',
        latency: 'medium'
      },
      {
        name: 'govdata_mirror',
        label: 'GovData Mirror',
        cost: 'medium',
        reliability: 'medium',
        latency: 'high',
        supports_airgapped: true
      }
    ]
  },
  {
    id: 'fpds_contracts',
    label: 'FPDS Contracts',
    description: 'Federal procurement data system records.',
    providers: [
      {
        name: 'fpds',
        label: 'FPDS API',
        cost: 'medium',
        reliability: 'high',
        latency: 'medium'
      }
    ]
  }
];

function sortProviders(
  providers: CapabilityProvider[],
  prefer?: 'reliability' | 'cost' | 'latency',
  fallback?: 'reliability' | 'cost' | 'latency'
) {
  const score = (provider: CapabilityProvider, metric: 'reliability' | 'cost' | 'latency') => {
    const map: Record<'low' | 'medium' | 'high', number> = {
      high: 3,
      medium: 2,
      low: 1
    };
    if (metric === 'cost') {
      // lower cost should rank higher
      return 4 - map[provider.cost];
    }
    return map[provider[metric]];
  };

  return [...providers].sort((a, b) => {
    const primary = prefer ? score(b, prefer) - score(a, prefer) : 0;
    if (primary !== 0) return primary;
    return fallback ? score(b, fallback) - score(a, fallback) : 0;
  });
}

export function buildCapabilityPlan(
  capabilityIds: string[],
  options?: { preferAirgapped?: boolean }
): CapabilityPlan {
  const notes: string[] = [];
  const items: CapabilityPlanItem[] = [];

  capabilityIds.forEach(capabilityId => {
    const capability = CAPABILITY_DEFINITIONS.find(def => def.id === capabilityId);
    if (!capability) return;

    const providers = sortProviders(
      options?.preferAirgapped
        ? capability.providers.filter(provider => provider.supports_airgapped)
        : capability.providers,
      capability.policy?.prefer,
      capability.policy?.fallback
    );

    if (providers.length === 0) {
      notes.push(`No providers available for ${capability.label} under current constraints.`);
      return;
    }

    const [preferred, ...fallbacks] = providers;

    items.push({
      capability,
      preferred,
      fallbacks
    });

    if (options?.preferAirgapped && !preferred.supports_airgapped) {
      notes.push(`Using connected provider ${preferred.label} for ${capability.label} because no air-gapped option exists.`);
    }
  });

  return {
    items,
    notes
  };
}
