// src/auth/setup-venv.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function log(msg: string): void {
  console.error(`[Auth Setup] ${msg}`);
}

export async function ensurePythonVenv(repoRoot: string): Promise<string> {
  const venvDir = path.join(repoRoot, 'auth', '.venv');
  const pythonBin = path.join(venvDir, 'bin', 'python3');
  const pipBin = path.join(venvDir, 'bin', 'pip');

  // Step 1: Create venv if missing
  if (!fs.existsSync(pythonBin)) {
    log('Creating Python virtual environment...');
    await execFileAsync('python3', ['-m', 'venv', venvDir], { timeout: 60000 });
    log('Virtual environment created.');
  }

  // Step 2: Check if playwright is installed
  try {
    await execFileAsync(pythonBin, ['-c', 'import playwright'], { timeout: 10000 });
  } catch {
    log('Installing playwright and requests...');
    await execFileAsync(pipBin, ['install', 'playwright', 'requests'], {
      timeout: 120000,
    });
    log('Python dependencies installed.');
  }

  // Step 3: Check if Chromium browser is installed
  try {
    await execFileAsync(pythonBin, ['-c',
      'from playwright.sync_api import sync_playwright; p = sync_playwright().start(); p.chromium.executable_path; p.stop()'
    ], { timeout: 15000 });
  } catch {
    log('Installing Chromium for Playwright (this may take a minute)...');
    const playwrightBin = path.join(venvDir, 'bin', 'playwright');
    await execFileAsync(playwrightBin, ['install', 'chromium'], {
      timeout: 300000,
    });
    log('Chromium installed.');
  }

  return pythonBin;
}
