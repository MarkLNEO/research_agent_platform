export interface SignalPreference {
  signal_type: string;
  importance: 'critical' | 'important' | 'nice_to_have';
  lookback_days: number;
  config: Record<string, any>;
}

export interface TrackedAccount {
  id: string;
  user_id: string;
  company_name: string;
  company_url?: string;
  industry?: string;
  last_researched_at?: string;
}

export interface DetectedSignal {
  signal_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  signal_date: string;
  source_url?: string;
  score: number;
  confidence?: 'low' | 'medium' | 'high';
  raw_payload?: Record<string, any>;
}

export interface DetectorContext {
  account: TrackedAccount;
  preferences: SignalPreference[];
  openaiKey: string;
}

export interface DetectorResult {
  status: 'success' | 'noop' | 'error';
  signals: DetectedSignal[];
  error?: string;
  detector: string;
}

export interface SignalDetector {
  id: string;
  filterPreferences(preferences: SignalPreference[]): SignalPreference[];
  run(context: DetectorContext): Promise<DetectorResult>;
}
