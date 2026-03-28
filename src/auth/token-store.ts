// src/auth/token-store.ts

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface StoredTokens {
  canvas_domain: string;
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
  obtained_at: string;
  last_refreshed_at: string;
  user?: { id: number; name: string };
}

const STORE_DIR = path.join(os.homedir(), '.canvas-mcp');
const STORE_FILE = path.join(STORE_DIR, 'tokens.json');

export function getTokenStorePath(): string {
  return STORE_FILE;
}

export function loadTokens(domain: string): StoredTokens | null {
  try {
    if (!fs.existsSync(STORE_FILE)) return null;
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw) as StoredTokens;
    if (data.canvas_domain !== domain) return null;
    if (!data.access_token && !data.refresh_token) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: StoredTokens): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
  const tmpFile = STORE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  fs.renameSync(tmpFile, STORE_FILE);
}

export function clearAccessToken(): void {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw) as StoredTokens;
    data.access_token = '';
    const tmpFile = STORE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmpFile, STORE_FILE);
  } catch {
    // Ignore errors during cleanup
  }
}
