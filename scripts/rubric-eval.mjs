import fs from 'fs';
import path from 'path';

const reportPath = path.join(process.cwd(), 'test-artifacts', 'vision_report.json');

if (!fs.existsSync(reportPath)) {
  console.warn('rubric-eval: vision_report.json not found, skipping rubric scoring.');
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error('rubric-eval: failed to parse vision_report.json', error);
  process.exit(1);
}

if (!Array.isArray(payload)) {
  console.warn('rubric-eval: vision_report.json not in expected format.');
  process.exit(0);
}

const rubricEntries = payload.filter((entry) => typeof entry?.file === 'string' && entry.file.startsWith('test-artifacts/rubric/'));

if (rubricEntries.length === 0) {
  console.log('rubric-eval: no rubric screenshots found in vision report.');
  process.exit(0);
}

const thresholdEnv = process.env.RUBRIC_SCORE_THRESHOLD;
const threshold = typeof thresholdEnv === 'string' ? Number(thresholdEnv) : null;
const failures = [];

for (const entry of rubricEntries) {
  const { file, scores } = entry;
  if (!scores || typeof scores !== 'object') {
    failures.push(`${file}: missing scores in vision report`);
    continue;
  }
  for (const [key, value] of Object.entries(scores)) {
    if (typeof value === 'number' && threshold !== null && value < threshold) {
      failures.push(`${file}: ${key} score ${value} < ${threshold}`);
    }
  }
}

if (threshold !== null && failures.length > 0) {
  console.error('rubric-eval: rubric score check failed:\n' + failures.map((f) => ` - ${f}`).join('\n'));
  process.exit(1);
}

if (threshold !== null) {
  console.log(`rubric-eval: all rubric screenshots scored >= ${threshold}.`);
} else {
  console.log('rubric-eval: threshold not set; no gating applied. Set RUBRIC_SCORE_THRESHOLD to enable enforcement.');
}
