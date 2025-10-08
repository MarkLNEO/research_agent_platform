#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stageThreshold = Number(process.env.RUBRIC_STAGE_THRESHOLD ?? '600000');
const totalThreshold = Number(process.env.RUBRIC_TOTAL_THRESHOLD ?? '600000');
const smokeEnv = {
  ...process.env,
  RUBRIC_SMOKE: '1',
};

if (!smokeEnv.RUBRIC_SMOKE_IDS) {
  smokeEnv.RUBRIC_SMOKE_IDS = 'onboarding-step-01-company,dashboard-signals-focused,research-exec-summary,signal-detail,meeting-prep-summary';
}

async function runStage(name, command, args = [], options = {}) {
  const start = Date.now();
  const timeout = options.timeout ?? stageThreshold;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      env: options.env || smokeEnv,
      cwd: options.cwd || process.cwd(),
    });

    let timedOut = false;
    const timer = timeout > 0 ? setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout) : null;

    child.on('exit', (code, signal) => {
      if (timer) clearTimeout(timer);
      const elapsed = Date.now() - start;
      if (timedOut) {
        reject(new Error(`Stage "${name}" exceeded ${timeout}ms; terminated after ${(elapsed / 1000).toFixed(1)}s`));
        return;
      }
      if (code === 0) {
        resolve({ elapsed });
      } else {
        reject(new Error(`Stage "${name}" failed with exit code ${code}${signal ? ` (signal ${signal})` : ''}`));
      }
    });
  });
}

(async () => {
  const totalStart = Date.now();
  try {
    const playwrightStage = await runStage(
      'playwright',
      'npx',
      ['playwright', 'test', 'tests/e2e/rubric.spec.ts'],
    );
    console.log(`[rubric:smoke] Playwright stage completed in ${(playwrightStage.elapsed / 1000).toFixed(1)}s`);

    const visionStage = await runStage('vision', 'node', ['scripts/describe-screenshots.mjs']);
    console.log(`[rubric:smoke] Vision stage completed in ${(visionStage.elapsed / 1000).toFixed(1)}s`);

    const evalStage = await runStage('rubric-eval', 'node', ['scripts/rubric-eval.mjs']);
    console.log(`[rubric:smoke] Rubric evaluation completed in ${(evalStage.elapsed / 1000).toFixed(1)}s`);

    const totalElapsed = Date.now() - totalStart;
    console.log(`[rubric:smoke] Finished in ${(totalElapsed / 1000).toFixed(1)}s`);
    if (totalThreshold && totalElapsed > totalThreshold) {
      throw new Error(`Smoke run exceeded total threshold ${totalThreshold}ms (took ${totalElapsed}ms)`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
