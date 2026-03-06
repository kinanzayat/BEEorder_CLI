import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_ROUTES } from './routes.js';

const APP_DIR = path.join(os.homedir(), '.beeorder-cli');
const CONFIG_PATH = path.join(APP_DIR, 'config.json');

export function getConfigPath() {
  return CONFIG_PATH;
}

export function defaultConfig() {
  return {
    baseUrl: 'https://client.beeorder.com/',
    socketUrl: 'https://client-sct-io.beeorder.com',
    platform: 'android',
    appVersion: '5.8.3',
    language: 'en',
    timeoutMs: 30000,
    headers: {},
    routes: { ...DEFAULT_ROUTES }
  };
}

function ensureAppDir() {
  fs.mkdirSync(APP_DIR, { recursive: true, mode: 0o700 });
}

function mergeWithDefaults(raw) {
  const defaults = defaultConfig();
  return {
    ...defaults,
    ...raw,
    headers: {
      ...defaults.headers,
      ...(raw?.headers || {})
    },
    routes: {
      ...defaults.routes,
      ...(raw?.routes || {})
    }
  };
}

export function loadConfig() {
  ensureAppDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    const config = defaultConfig();
    saveConfig(config);
    return config;
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return mergeWithDefaults(parsed);
}

export function saveConfig(config) {
  ensureAppDir();
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function updateConfig(mutator) {
  const config = loadConfig();
  const updated = mutator(structuredClone(config)) || config;
  saveConfig(updated);
  return updated;
}

export function resetConfig() {
  const config = defaultConfig();
  saveConfig(config);
  return config;
}
