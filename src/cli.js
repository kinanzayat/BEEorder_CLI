import { loadConfig, resetConfig, updateConfig, getConfigPath } from './config-store.js';
import { clearSession, getSessionPath, loadSession, saveSession } from './session-store.js';
import { BeeOrderClient } from './http-client.js';
import { DEFAULT_ROUTES } from './routes.js';
import {
  extractTokens,
  maskToken,
  parseArgs,
  parseQueryFlags,
  pickBody,
  printJson,
  toBool
} from './utils.js';

function helpText() {
  return `BeeOrder CLI

Usage:
  beeorder <command> [subcommand] [options]

Core:
  beeorder config show
  beeorder config set <key> <value>
  beeorder config reset

  beeorder header show
  beeorder header set <key> <value>
  beeorder header unset <key>
  beeorder header clear

  beeorder route show
  beeorder route set <name> <path>
  beeorder route reset

Auth:
  beeorder auth login --phone 9xxxxxxxx [--countryCode 963]
  beeorder auth verify --phone 9xxxxxxxx --otp 1234
  beeorder auth resend --phone 9xxxxxxxx [--countryCode 963]
  beeorder auth logout

Session:
  beeorder session show
  beeorder session clear

API:
  beeorder api --method GET --path user/orders --auth --query page=1 --query limit=20
  beeorder api --method POST --path orders/calculate --auth --file ./body.json

Helpers:
  beeorder cart get
  beeorder orders current
  beeorder orders list --query page=1
  beeorder checkout calc --file ./checkout.json
  beeorder checkout place --file ./order.json --yes

Notes:
  - Route names and headers are editable so we can match captured mobile traffic.
  - Order placement is blocked unless --yes is provided.
`;
}

function getClientContext() {
  const config = loadConfig();
  const session = loadSession();
  const client = new BeeOrderClient(config, session);
  return { config, session, client };
}

function requireValue(value, message) {
  if (value === undefined || value === null || value === '') {
    throw new Error(message);
  }
  return value;
}

function getAuthPayload(flags, mode) {
  const explicit = pickBody(flags);
  if (explicit !== undefined) return explicit;

  const phone = flags.phone || flags.mobile || flags.phoneNumber;
  const countryCode = flags.countryCode || flags.country || '963';
  const normalizedCountryCode = String(countryCode).replace(/^\+/, '');
  const rawPhone = requireValue(phone, 'Missing phone/mobile. Provide --phone/--mobile or --payload/--file.');
  let normalizedMobile = String(rawPhone).trim();

  if (normalizedMobile.startsWith('+')) {
    const withoutPlus = normalizedMobile.slice(1);
    if (withoutPlus.startsWith(normalizedCountryCode)) {
      normalizedMobile = withoutPlus.slice(normalizedCountryCode.length);
    } else {
      normalizedMobile = withoutPlus;
    }
  }

  if (normalizedMobile.startsWith('0') && normalizedMobile.length >= 10) {
    normalizedMobile = normalizedMobile.replace(/^0+/, '');
  }

  if (mode === 'verify') {
    const otp = flags.otp || flags.code;
    requireValue(otp, 'Missing OTP. Provide --otp or --payload/--file.');
    return {
      mobile: normalizedMobile,
      otp: String(otp)
    };
  }

  return {
    mobile: normalizedMobile,
    countryCode: String(countryCode)
  };
}

function normalizeConfigValue(key, value) {
  if (key === 'timeoutMs') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('timeoutMs must be a positive number.');
    }
    return parsed;
  }

  return String(value);
}

function outputResponse(response, verbose = false) {
  const payload = {
    ok: response.ok,
    status: response.status,
    method: response.method,
    url: response.url,
    data: response.data
  };

  if (verbose) {
    payload.responseHeaders = response.headers;
  }

  printJson(payload);
}

async function doRequest({ method, routeName, path, flags, auth, bodyRequired = false }) {
  const { client } = getClientContext();
  const query = parseQueryFlags(flags.query);
  const body = pickBody(flags);

  if (bodyRequired && body === undefined) {
    throw new Error('Missing request body. Provide --file or --body.');
  }

  const response = await client.request({
    method,
    routeName,
    path,
    query,
    body,
    auth,
    headers: {}
  });

  outputResponse(response, toBool(flags.verbose, false));
  if (!response.ok) process.exitCode = 1;
  return response;
}

async function handleConfig(positional) {
  const sub = positional[0] || 'show';

  if (sub === 'show') {
    printJson({ path: getConfigPath(), config: loadConfig() });
    return;
  }

  if (sub === 'reset') {
    const config = resetConfig();
    printJson({ message: 'Config reset.', path: getConfigPath(), config });
    return;
  }

  if (sub === 'set') {
    const key = requireValue(positional[1], 'Missing config key.');
    const value = requireValue(positional[2], 'Missing config value.');
    const allowed = ['baseUrl', 'socketUrl', 'platform', 'appVersion', 'language', 'timeoutMs'];

    if (!allowed.includes(key)) {
      throw new Error(`Unsupported config key: ${key}`);
    }

    const updated = updateConfig((cfg) => {
      cfg[key] = normalizeConfigValue(key, value);
      return cfg;
    });

    printJson({ message: `Updated config.${key}`, config: updated });
    return;
  }

  throw new Error(`Unknown config subcommand: ${sub}`);
}

async function handleHeader(positional) {
  const sub = positional[0] || 'show';

  if (sub === 'show') {
    const config = loadConfig();
    printJson(config.headers || {});
    return;
  }

  if (sub === 'set') {
    const key = requireValue(positional[1], 'Missing header key.');
    const value = requireValue(positional[2], 'Missing header value.');

    const updated = updateConfig((cfg) => {
      cfg.headers = cfg.headers || {};
      cfg.headers[key] = value;
      return cfg;
    });

    printJson({ message: `Header set: ${key}`, headers: updated.headers });
    return;
  }

  if (sub === 'unset') {
    const key = requireValue(positional[1], 'Missing header key.');
    const updated = updateConfig((cfg) => {
      cfg.headers = cfg.headers || {};
      delete cfg.headers[key];
      return cfg;
    });

    printJson({ message: `Header removed: ${key}`, headers: updated.headers });
    return;
  }

  if (sub === 'clear') {
    const updated = updateConfig((cfg) => {
      cfg.headers = {};
      return cfg;
    });

    printJson({ message: 'Headers cleared.', headers: updated.headers });
    return;
  }

  throw new Error(`Unknown header subcommand: ${sub}`);
}

async function handleRoute(positional) {
  const sub = positional[0] || 'show';

  if (sub === 'show') {
    const config = loadConfig();
    printJson(config.routes || {});
    return;
  }

  if (sub === 'set') {
    const name = requireValue(positional[1], 'Missing route name.');
    const path = requireValue(positional[2], 'Missing route path.');

    const updated = updateConfig((cfg) => {
      cfg.routes = cfg.routes || {};
      cfg.routes[name] = path;
      return cfg;
    });

    printJson({ message: `Route set: ${name}`, route: updated.routes[name] });
    return;
  }

  if (sub === 'reset') {
    const updated = updateConfig((cfg) => {
      cfg.routes = { ...DEFAULT_ROUTES };
      return cfg;
    });

    printJson({ message: 'Routes reset.', routes: updated.routes });
    return;
  }

  throw new Error(`Unknown route subcommand: ${sub}`);
}

async function handleSession(positional) {
  const sub = positional[0] || 'show';

  if (sub === 'show') {
    const session = loadSession();
    printJson({
      path: getSessionPath(),
      session: {
        ...session,
        accessToken: maskToken(session.accessToken),
        refreshToken: maskToken(session.refreshToken)
      }
    });
    return;
  }

  if (sub === 'clear') {
    clearSession();
    printJson({ message: 'Session cleared.', path: getSessionPath() });
    return;
  }

  throw new Error(`Unknown session subcommand: ${sub}`);
}

async function handleAuth(positional, flags) {
  const sub = positional[0];
  const { client } = getClientContext();

  if (sub === 'login') {
    const payload = getAuthPayload(flags, 'login');
    const response = await client.request({
      method: 'POST',
      routeName: 'authLogin',
      body: payload,
      auth: false
    });
    outputResponse(response, toBool(flags.verbose, false));
    if (!response.ok) process.exitCode = 1;
    return;
  }

  if (sub === 'verify') {
    const payload = getAuthPayload(flags, 'verify');
    const response = await client.request({
      method: 'POST',
      routeName: 'authVerify',
      body: payload,
      auth: false
    });

    outputResponse(response, toBool(flags.verbose, false));

    if (!response.ok) {
      process.exitCode = 1;
      return;
    }

    const tokens = extractTokens(response.data);
    if (!tokens) {
      console.error('No token fields were auto-detected. Use `session show` after manual mapping.');
      return;
    }

    const previous = loadSession();
    const updated = {
      ...previous,
      ...tokens,
      updatedAt: new Date().toISOString()
    };
    saveSession(updated);

    printJson({
      message: 'Session updated from verify response.',
      accessToken: maskToken(updated.accessToken),
      refreshToken: maskToken(updated.refreshToken),
      userId: updated.userId
    });
    return;
  }

  if (sub === 'resend') {
    const payload = getAuthPayload(flags, 'login');
    const response = await client.request({
      method: 'POST',
      routeName: 'authResendOtp',
      body: payload,
      auth: false
    });
    outputResponse(response, toBool(flags.verbose, false));
    if (!response.ok) process.exitCode = 1;
    return;
  }

  if (sub === 'logout') {
    const response = await client.request({
      method: 'POST',
      routeName: 'authLogout',
      auth: true
    });
    outputResponse(response, toBool(flags.verbose, false));
    if (response.ok && !toBool(flags['keep-session'], false)) {
      clearSession();
      printJson({ message: 'Session cleared after logout.' });
    }
    if (!response.ok) process.exitCode = 1;
    return;
  }

  throw new Error('Unknown auth subcommand. Use login, verify, resend, logout.');
}

async function handleApi(positional, flags) {
  const method = String(flags.method || 'GET').toUpperCase();
  const routeName = flags.route ? String(flags.route) : undefined;
  const path = flags.path ? String(flags.path) : positional[0];
  const auth = toBool(flags.auth, false);

  if (!routeName && !path) {
    throw new Error('Provide --path <endpoint> or --route <routeName>.');
  }

  await doRequest({
    method,
    routeName,
    path,
    flags,
    auth,
    bodyRequired: method !== 'GET'
  });
}

async function handleCart(positional, flags) {
  const sub = positional[0] || 'get';

  if (sub === 'get') {
    await doRequest({ method: 'GET', routeName: 'cartGet', flags, auth: true });
    return;
  }

  if (sub === 'update') {
    const method = String(flags.method || 'POST').toUpperCase();
    await doRequest({ method, routeName: 'cartUpdate', flags, auth: true, bodyRequired: true });
    return;
  }

  throw new Error('Unknown cart subcommand. Use get or update.');
}

async function handleOrders(positional, flags) {
  const sub = positional[0] || 'current';

  if (sub === 'current') {
    await doRequest({ method: 'GET', routeName: 'ordersCurrent', flags, auth: true });
    return;
  }

  if (sub === 'list') {
    await doRequest({ method: 'GET', routeName: 'ordersList', flags, auth: true });
    return;
  }

  if (sub === 'create') {
    if (!toBool(flags.yes, false)) {
      throw new Error('Refusing to place an order without --yes.');
    }

    await doRequest({
      method: 'POST',
      routeName: 'ordersCreate',
      flags,
      auth: true,
      bodyRequired: true
    });
    return;
  }

  throw new Error('Unknown orders subcommand. Use current, list, create.');
}

async function handleCheckout(positional, flags) {
  const sub = positional[0] || 'calc';

  if (sub === 'calc') {
    await doRequest({
      method: 'POST',
      routeName: 'ordersCalculate',
      flags,
      auth: true,
      bodyRequired: true
    });
    return;
  }

  if (sub === 'place') {
    if (!toBool(flags.yes, false)) {
      throw new Error('Refusing to place an order without --yes.');
    }

    await doRequest({
      method: 'POST',
      routeName: 'ordersCreate',
      flags,
      auth: true,
      bodyRequired: true
    });
    return;
  }

  throw new Error('Unknown checkout subcommand. Use calc or place.');
}

async function handleRestaurants(positional, flags) {
  const sub = positional[0] || 'list';
  if (sub !== 'list') {
    throw new Error('Unknown restaurants subcommand. Use list.');
  }

  await doRequest({ method: 'GET', routeName: 'restaurantsList', flags, auth: false });
}

async function handleSearch(positional, flags) {
  const sub = positional[0] || 'restaurant';
  if (sub !== 'restaurant') {
    throw new Error('Unknown search subcommand. Use restaurant.');
  }

  const localFlags = { ...flags };
  const queryText = flags.q || flags.queryText || flags.text;
  if (queryText) {
    const currentQuery = Array.isArray(localFlags.query) ? localFlags.query : localFlags.query ? [localFlags.query] : [];
    currentQuery.push(`q=${queryText}`);
    localFlags.query = currentQuery;
  }

  await doRequest({ method: 'GET', routeName: 'searchRestaurant', flags: localFlags, auth: false });
}

export async function runCli(argv) {
  const { positional, flags } = parseArgs(argv);
  const command = positional[0];

  if (!command || flags.help || flags.h) {
    console.log(helpText());
    return;
  }

  if (command === 'help') {
    console.log(helpText());
    return;
  }

  const rest = positional.slice(1);

  switch (command) {
    case 'config':
      await handleConfig(rest, flags);
      break;
    case 'header':
      await handleHeader(rest, flags);
      break;
    case 'route':
      await handleRoute(rest, flags);
      break;
    case 'session':
      await handleSession(rest, flags);
      break;
    case 'auth':
      await handleAuth(rest, flags);
      break;
    case 'api':
      await handleApi(rest, flags);
      break;
    case 'cart':
      await handleCart(rest, flags);
      break;
    case 'orders':
      await handleOrders(rest, flags);
      break;
    case 'checkout':
      await handleCheckout(rest, flags);
      break;
    case 'restaurants':
      await handleRestaurants(rest, flags);
      break;
    case 'search':
      await handleSearch(rest, flags);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
