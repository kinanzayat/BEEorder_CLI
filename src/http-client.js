function normalizePath(path) {
  if (!path) return path;
  return path.startsWith('/') ? path.slice(1) : path;
}

function withQuery(baseUrl, query = {}) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

export class BeeOrderClient {
  constructor(config, session = {}) {
    this.config = config;
    this.session = session;
  }

  resolveRoute(routeName) {
    const path = this.config.routes?.[routeName];
    if (!path) {
      throw new Error(`Unknown route name: ${routeName}`);
    }
    return path;
  }

  async request({
    method = 'GET',
    path,
    routeName,
    query = {},
    body,
    auth = false,
    headers = {}
  }) {
    const routePath = routeName ? this.resolveRoute(routeName) : path;
    if (!routePath) throw new Error('Missing request path.');

    const baseUrl = this.config.baseUrl.endsWith('/')
      ? this.config.baseUrl
      : `${this.config.baseUrl}/`;

    const fullUrl = new URL(normalizePath(routePath), baseUrl).toString();
    const urlWithQuery = withQuery(fullUrl, query);

    const requestHeaders = {
      accept: 'application/json',
      'user-agent': 'beeorder-cli/0.1.0',
      'accept-language': this.config.language || 'en',
      'x-platform': this.config.platform || 'android',
      'x-app-version': this.config.appVersion || '5.8.3',
      ...(this.config.headers || {}),
      ...headers
    };

    if (auth) {
      if (!this.session?.accessToken) {
        throw new Error('No access token in session. Run auth verify first.');
      }
      requestHeaders.authorization = `Bearer ${this.session.accessToken}`;
    }

    const hasBody = body !== undefined;
    if (hasBody) {
      requestHeaders['content-type'] = requestHeaders['content-type'] || 'application/json';
    }

    const timeoutMs = Number(this.config.timeoutMs || 30000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(urlWithQuery, {
        method: method.toUpperCase(),
        headers: requestHeaders,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    let data = text;
    if (contentType.includes('application/json') && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      url: urlWithQuery.toString(),
      method: method.toUpperCase(),
      data,
      headers: Object.fromEntries(response.headers.entries())
    };
  }
}
