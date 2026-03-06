import fs from 'node:fs';

export function parseArgs(argv) {
  const positional = [];
  const flags = {};

  function setFlag(key, value) {
    if (flags[key] === undefined) {
      flags[key] = value;
      return;
    }

    if (Array.isArray(flags[key])) {
      flags[key].push(value);
      return;
    }

    flags[key] = [flags[key], value];
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const clean = token.slice(2);
    if (!clean) {
      continue;
    }

    const eqIndex = clean.indexOf('=');
    if (eqIndex >= 0) {
      const key = clean.slice(0, eqIndex);
      const value = clean.slice(eqIndex + 1);
      setFlag(key, value);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      setFlag(clean, next);
      i += 1;
      continue;
    }

    setFlag(clean, true);
  }

  return { positional, flags };
}

export function toBool(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export function parseJsonString(text, label = 'JSON') {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error.message}`);
  }
}

export function pickBody(flags) {
  if (flags.file) return readJsonFile(String(flags.file));
  if (flags.body) return parseJsonString(String(flags.body), '--body');
  if (flags.payload) return parseJsonString(String(flags.payload), '--payload');
  return undefined;
}

export function parseQueryFlags(queryValue) {
  if (queryValue === undefined) return {};
  const list = Array.isArray(queryValue) ? queryValue : [queryValue];
  const query = {};

  for (const entry of list) {
    const text = String(entry);
    const idx = text.indexOf('=');
    if (idx <= 0) {
      throw new Error(`Invalid --query entry \"${text}\". Expected key=value.`);
    }

    const key = text.slice(0, idx);
    const value = text.slice(idx + 1);
    query[key] = value;
  }

  return query;
}

export function extractTokens(payload) {
  const accessKeys = ['accessToken', 'access_token', 'token', 'authToken', 'jwt'];
  const refreshKeys = ['refreshToken', 'refresh_token'];
  const userIdKeys = ['userId', 'user_id', 'id'];

  let best = null;
  const stack = [payload];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;

    const accessToken = accessKeys.map((k) => current[k]).find(Boolean);
    const refreshToken = refreshKeys.map((k) => current[k]).find(Boolean);
    const userId = userIdKeys.map((k) => current[k]).find(Boolean);

    if (accessToken || refreshToken) {
      const candidate = {
        accessToken: accessToken ? String(accessToken) : undefined,
        refreshToken: refreshToken ? String(refreshToken) : undefined,
        userId: userId ? String(userId) : undefined,
        rawAuth: current
      };

      if (candidate.accessToken && candidate.refreshToken) return candidate;
      if (!best && candidate.accessToken) best = candidate;
      if (!best && candidate.refreshToken) best = candidate;
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return best;
}

export function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

export function maskToken(token) {
  if (!token) return undefined;
  if (token.length <= 10) return `${token.slice(0, 2)}...`;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
