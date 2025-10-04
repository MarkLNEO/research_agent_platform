export type ImportanceLevel = 'critical' | 'important' | 'nice_to_have';

export interface ScoreInput {
  importance: ImportanceLevel;
  signalDate: string;
  confidence?: 'low' | 'medium' | 'high';
  baseScore?: number;
}

export function calculateSignalScore({
  importance,
  signalDate,
  confidence = 'medium',
  baseScore = 25,
}: ScoreInput): number {
  let importanceWeight = 1;
  switch (importance) {
    case 'critical':
      importanceWeight = 1.6;
      break;
    case 'important':
      importanceWeight = 1.3;
      break;
    default:
      importanceWeight = 1;
  }

  let confidenceWeight = 1;
  if (confidence === 'high') confidenceWeight = 1.2;
  if (confidence === 'low') confidenceWeight = 0.8;

  const recencyWeight = getRecencyWeight(signalDate);
  const rawScore = baseScore * importanceWeight * confidenceWeight * recencyWeight;
  return Math.round(Math.min(rawScore, 100));
}

function getRecencyWeight(signalDate: string): number {
  const date = new Date(signalDate);
  if (Number.isNaN(date.getTime())) return 0.7;

  const diffDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
  if (diffDays <= 7) return 1.5;
  if (diffDays <= 30) return 1.2;
  if (diffDays <= 90) return 1;
  return 0.6;
}

export function determineSeverity(importance: ImportanceLevel, score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (importance === 'critical' || score >= 80) return 'critical';
  if (importance === 'important' || score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
