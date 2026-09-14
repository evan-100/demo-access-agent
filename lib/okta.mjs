export class OktaError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'OktaError';
    this.status = status;
    this.body = body ?? null;
  }
}

export function createOktaClient({ orgUrl, apiToken, fetchFn = globalThis.fetch }) {
  const base = orgUrl.replace(/\/+$/, '');

  async function request(method, path, { query, body } = {}) {
    const url = new URL(`${base}/api/v1${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const res = await fetchFn(url, {
      method,
      headers: {
        Authorization: `SSWS ${apiToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    if (!res.ok) {
      const summary = parsed?.errorSummary ? ` ${parsed.errorSummary}` : '';
      throw new OktaError(`Okta ${method} ${path} failed: ${res.status}${summary}`, { status: res.status, body: parsed });
    }
    if (parsed?.raw) {
      throw new OktaError(`Okta ${method} ${path} returned non-JSON body`, { status: res.status, body: parsed });
    }
    return parsed;
  }

  const enc = encodeURIComponent;

  return {
    whoAmI: () => request('GET', '/users/me'),
    listUsers: () => request('GET', '/users', { query: { limit: '200', filter: 'status eq "ACTIVE"' } }),
    getUser: (idOrLogin) => request('GET', `/users/${enc(idOrLogin)}`),
    listUserGroups: (userId) => request('GET', `/users/${enc(userId)}/groups`),
    async findGroupByName(name) {
      const groups = await request('GET', '/groups', { query: { q: name, limit: '20' } });
      return groups.find((g) => g.profile?.name === name) ?? null;
    },
    createGroup: (name, description) => request('POST', '/groups', { body: { profile: { name, description } } }),
    createUser: ({ firstName, lastName, email, login, title, password }) =>
      request('POST', '/users', {
        query: { activate: 'true' },
        body: { profile: { firstName, lastName, email, login, title }, credentials: { password: { value: password } } },
      }),
    addUserToGroup: (groupId, userId) => request('PUT', `/groups/${enc(groupId)}/users/${enc(userId)}`),
    removeUserFromGroup: (groupId, userId) => request('DELETE', `/groups/${enc(groupId)}/users/${enc(userId)}`),
  };
}
