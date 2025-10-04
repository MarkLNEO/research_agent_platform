import { calculateSignalScore, determineSeverity } from '../lib/scoring.ts';
import type {
  DetectorContext,
  DetectorResult,
  DetectedSignal,
  SignalPreference,
} from '../types.ts';

interface PromptDetectorConfig {
  detector: string;
  defaultSignalType: string;
  description: string;
  instruction?: string;
  queryHints: string[];
  formatExample?: string;
}

const JSON_BLOCK_REGEX = /```json\s*([\s\S]*?)\s*```/i;

export function normalizeSignalType(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/__+/g, '_')
    .trim();
}

export async function runPromptDetector(
  ctx: DetectorContext,
  config: PromptDetectorConfig,
): Promise<DetectorResult> {
  const { account, preferences, openaiKey } = ctx;
  const uniquePrefs = dedupePreferences(preferences);
  const lookback = Math.max(...uniquePrefs.map((pref) => pref.lookback_days));

  const preferenceDetails = uniquePrefs
    .map((pref) => {
      const details: string[] = [`type: ${pref.signal_type}`, `importance: ${pref.importance}`, `lookback_days: ${pref.lookback_days}`];
      if (pref.config && Object.keys(pref.config).length > 0) {
        details.push(`config: ${JSON.stringify(pref.config)}`);
      }
      return `- ${details.join(', ')}`;
    })
    .join('\n');

  const promptSections = [
    `You are part of the SignalMonitorService. Analyze recent, credible sources to detect **${config.description}** for the company "${account.company_name}".`,
    `Consider up to the last ${lookback} days. Only return real signals with verifiable references.`,
    `User signal preferences:`,
    preferenceDetails,
    `Preferred search angles (use your web_search tool):`,
    config.queryHints.map((hint) => `- ${hint}`).join('\n'),
  ];

  if (config.instruction) {
    promptSections.push(config.instruction);
  }

  promptSections.push(
    `Respond **only** with a JSON array. Each element must include:`,
    `signal_type (string)`,
    `description (string, concise yet specific)`,
    `signal_date (YYYY-MM-DD)`,
    `source_url (string, HTTPS)`,
    `confidence (high | medium | low)`,
  );

  if (config.formatExample) {
    promptSections.push(`Example: ${config.formatExample}`);
  }

  const prompt = promptSections.join('\n\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        },
      ],
      tools: [
        {
          type: 'web_search',
          user_location: { type: 'approximate' },
          search_context_size: 'medium',
        },
      ],
      text: {
        format: { type: 'json_object' },
      },
      reasoning: {
        effort: 'medium',
      },
      store: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      detector: config.detector,
      status: 'error',
      signals: [],
      error: `OpenAI error: ${response.status} ${errorText}`,
    };
  }

  const json = await response.json();
  const rawText = extractOutputText(json);
  const parsed = parseSignalsArray(rawText);

  if (!parsed.success) {
    return {
      detector: config.detector,
      status: 'error',
      signals: [],
      error: parsed.error,
    };
  }

  const normalizedSignals = parsed.data
    .map((signal) =>
      normalizeSignal(signal, uniquePrefs, config.defaultSignalType),
    )
    .filter((signal): signal is DetectedSignal => signal !== null);

  return {
    detector: config.detector,
    status: normalizedSignals.length > 0 ? 'success' : 'noop',
    signals: normalizedSignals,
  };
}

function dedupePreferences(preferences: SignalPreference[]): SignalPreference[] {
  const seen = new Map<string, SignalPreference>();
  for (const pref of preferences) {
    const key = normalizeSignalType(pref.signal_type);
    if (!seen.has(key)) {
      seen.set(key, pref);
    }
  }
  return [...seen.values()];
}

function extractOutputText(apiResponse: any): string {
  if (apiResponse?.output_text) {
    return String(apiResponse.output_text);
  }

  if (Array.isArray(apiResponse?.output)) {
    return apiResponse.output
      .filter((item: any) => item?.type === 'output_text' && typeof item.text === 'string')
      .map((item: any) => item.text)
      .join('\n');
  }

  return JSON.stringify(apiResponse);
}

function parseSignalsArray(text: string): { success: true; data: any[] } | { success: false; error: string } {
  let jsonText = text.trim();
  const match = jsonText.match(JSON_BLOCK_REGEX);
  if (match) {
    jsonText = match[1];
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return { success: true, data: parsed };
    }
    if (parsed && Array.isArray(parsed.signals)) {
      return { success: true, data: parsed.signals };
    }
    return {
      success: false,
      error: 'Expected JSON array of signals',
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse detector JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function normalizeSignal(
  raw: any,
  preferences: SignalPreference[],
  defaultSignalType: string,
): DetectedSignal | null {
  if (!raw || typeof raw !== 'object') return null;

  const rawType = typeof raw.signal_type === 'string' && raw.signal_type.trim().length > 0
    ? raw.signal_type
    : defaultSignalType;

  const normalizedType = normalizeSignalType(rawType);
  const pref = preferences.find((p) => normalizeSignalType(p.signal_type) === normalizedType)
    ?? preferences[0];

  if (!pref) return null;

  const signalDate = typeof raw.signal_date === 'string' ? raw.signal_date : new Date().toISOString().slice(0, 10);
  const confidence = normalizeConfidence(raw.confidence);

  const score = calculateSignalScore({
    importance: pref.importance,
    signalDate,
    confidence,
    baseScore: raw.base_score && Number.isFinite(raw.base_score) ? Number(raw.base_score) : undefined,
  });

  const severity = determineSeverity(pref.importance, score);

  const description = (raw.description ?? '').toString().trim();
  if (!description) return null;

  const sourceUrl = typeof raw.source_url === 'string' ? raw.source_url.trim() : undefined;
  if (!sourceUrl || !sourceUrl.startsWith('http')) return null;

  return {
    signal_type: normalizedType,
    description,
    signal_date: signalDate,
    source_url: sourceUrl,
    confidence,
    score,
    severity,
    raw_payload: raw,
  };
}

function normalizeConfidence(value: any): 'low' | 'medium' | 'high' {
  const normalized = String(value ?? 'medium').toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('low')) return 'low';
  return 'medium';
}
