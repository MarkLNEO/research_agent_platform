export type FocusPreference = {
  on?: boolean;
  weight?: number;
  [key: string]: unknown;
};

export type ResolvedPrefs = {
  focus: Record<string, FocusPreference>;
  coverage: {
    depth?: 'shallow' | 'standard' | 'deep';
    mode?: 'quick' | 'deep' | 'specific';
  };
  industry: {
    filters?: string[];
  };
  summary: {
    brevity?: 'short' | 'standard' | 'long';
  };
  tone?: 'warm' | 'balanced' | 'direct';
  [key: string]: unknown;
};
