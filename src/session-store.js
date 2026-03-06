import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = path.join(os.homedir(), '.beeorder-cli');
const SESSION_PATH = path.join(APP_DIR, 'session.json');

export function getSessionPath() {
  return SESSION_PATH;
}

function ensureAppDir() {
  fs.mkdirSync(APP_DIR, { recursive: true, mode: 0o700 });
}

export function loadSession() {
  ensureAppDir();
  if (!fs.existsSync(SESSION_PATH)) {
    return {};
  }

  const raw = fs.readFileSync(SESSION_PATH, 'utf8');
  return JSON.parse(raw);
}

export function saveSession(session) {
  ensureAppDir();
  fs.writeFileSync(SESSION_PATH, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
}

export function clearSession() {
  ensureAppDir();
  if (fs.existsSync(SESSION_PATH)) {
    fs.unlinkSync(SESSION_PATH);
  }
}
