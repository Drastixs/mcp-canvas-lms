// src/auth/python-auth.ts

import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PythonAuthParams {
  pythonPath: string;
  scriptPath: string;
  clientId: string;
  clientSecret: string;
  domain: string;
  email: string;
  password: string;
}

export interface PythonAuthResult {
  access_token: string;
  refresh_token: string;
  user: { id: number; name: string };
}

export class NoDisplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoDisplayError';
  }
}

async function hasXvfb(): Promise<boolean> {
  try {
    await execFileAsync('which', ['xvfb-run']);
    return true;
  } catch {
    return false;
  }
}

function hasDisplay(): boolean {
  return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

export async function runPythonAuth(params: PythonAuthParams): Promise<PythonAuthResult> {
  const useXvfb = !hasDisplay() && await hasXvfb();

  if (!hasDisplay() && !useXvfb) {
    throw new NoDisplayError(
      'No display available for browser authentication. Options:\n' +
      '  (a) Run from a GUI session\n' +
      '  (b) Install xvfb: sudo apt install xvfb\n' +
      `  (c) Generate a token manually at https://${params.domain}/profile/settings > Access Tokens`
    );
  }

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    CANVAS_DOMAIN: params.domain,
    CANVAS_CLIENT_ID: params.clientId,
    CANVAS_CLIENT_SECRET: params.clientSecret,
    CANVAS_EMAIL: params.email,
    CANVAS_PASSWORD: params.password,
  };

  const command = useXvfb ? 'xvfb-run' : params.pythonPath;
  const args = useXvfb
    ? ['--auto-servernum', '--server-args=-screen 0 1024x768x24', params.pythonPath, params.scriptPath]
    : [params.scriptPath];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000, // 3 minutes
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      const line = data.toString();
      stderr += line;
      // Stream progress to console.error so it shows in Claude Code logs
      process.stderr.write(line);
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn Python auth script: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(
          `Python auth script exited with code ${code}.\n${stderr.slice(-500)}`
        ));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (!result.access_token || !result.refresh_token) {
          reject(new Error('Python auth script returned incomplete token data'));
          return;
        }
        resolve({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
          user: result.user || {},
        });
      } catch (parseErr) {
        reject(new Error(
          `Failed to parse Python auth output: ${stdout.slice(0, 200)}`
        ));
      }
    });
  });
}
