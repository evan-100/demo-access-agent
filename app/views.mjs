import { SCOPES, canAccess, ACTIONS } from '../lib/scopes.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; background: Canvas; color: CanvasText; }
  header { display: flex; gap: 1rem; align-items: center; padding: .75rem 1.25rem; border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent); }
  header a { color: inherit; text-decoration: none; padding: .25rem .5rem; border-radius: .375rem; }
  header a:hover { background: color-mix(in srgb, CanvasText 8%, transparent); }
  header .spacer { flex: 1; }
  main { max-width: 56rem; margin: 0 auto; padding: 1.5rem 1.25rem; }
  .badge { display: inline-block; padding: .125rem .5rem; border-radius: 999px; font-size: .8rem; border: 1px solid currentColor; }
  .badge.none { opacity: .6; }
  table { border-collapse: collapse; width: 100%; }
  td, th { text-align: left; padding: .5rem; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
  .access { font-size: .85rem; opacity: .8; margin-top: 2rem; padding-top: 1rem; border-top: 1px dashed color-mix(in srgb, CanvasText 25%, transparent); }
  .denied { padding: 1.5rem; border: 1px solid #c33; border-radius: .5rem; }
  button { font: inherit; padding: .25rem .6rem; }
`;

export function layout({ title, user, access, body }) {
  const nav = user
    ? `<a href="/dashboard">Dashboard</a><a href="/records">CRM Records</a><a href="/settings">Settings</a><span class="spacer"></span><span>${esc(user.name)}</span><a href="/logout">Log out</a>`
    : `<span class="spacer"></span><a href="/login">Log in</a>`;
  const panel = access
    ? `<section class="access"><strong>Access panel</strong><br>
       Live Okta scope: <span class="badge ${access.scope ? '' : 'none'}">${esc(access.scope ?? 'none')}</span>
       (groups: ${esc(access.groups.join(', ') || 'none')})<br>
       ID-token <code>groups</code> claim at login: ${esc(access.tokenGroups.join(', ') || 'none')}</section>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - Demo Platform</title><style>${CSS}</style></head>
<body><header><strong>Demo Platform</strong>${nav}</header><main><h1>${esc(title)}</h1>${body}${panel}</main></body></html>`;
}

export function home({ user }) {
  const body = user
    ? `<p>You are signed in. Open the <a href="/dashboard">dashboard</a>.</p>`
    : `<p>This is the toy demo environment gated by Okta group membership. <a href="/login">Log in with Okta</a>.</p>
       <p>If Okta refuses the login, you have no active demo grant. Ask the agent for one.</p>`;
  return layout({ title: 'Welcome', user, body });
}

export function dashboard({ user, access }) {
  const body = `<p>Scope tiers:</p><ul>${Object.entries(SCOPES).map(([name, s]) => `<li><strong>${esc(name)}</strong>: ${esc(s.description)} (Okta group <code>${esc(s.group)}</code>)</li>`).join('')}</ul>
  <p>Your current tier unlocks: ${access.scope ? esc(SCOPES[access.scope].description) : 'nothing'}.</p>`;
  return layout({ title: 'Dashboard', user, access, body });
}

const RECORDS = [
  { id: 1001, account: 'Northwind Traders', stage: 'Discovery', arr: '$48,000' },
  { id: 1002, account: 'Contoso Ltd', stage: 'Proposal', arr: '$120,000' },
  { id: 1003, account: 'Fabrikam Inc', stage: 'Negotiation', arr: '$92,500' },
  { id: 1004, account: 'Adventure Works', stage: 'Closed Won', arr: '$210,000' },
];

export function records({ user, access }) {
  const canEdit = canAccess(access.scope, ACTIONS.editRecords);
  const rows = RECORDS.map((r) => `<tr><td>${r.id}</td><td>${esc(r.account)}</td><td>${esc(r.stage)}</td><td>${esc(r.arr)}</td><td>${canEdit ? `<button data-action="edit" onclick="alert('Edit ${r.id} (demo only)')">Edit</button>` : '<span class="badge none">read-only</span>'}</td></tr>`).join('');
  const body = `<table><thead><tr><th>ID</th><th>Account</th><th>Stage</th><th>ARR</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  return layout({ title: 'CRM Records', user, access, body });
}

export function settings({ user, access }) {
  const body = `<p>Admin-only settings. If you can see this page, your live Okta scope is <strong>admin</strong>.</p>
  <ul><li>Demo data reset: <button onclick="alert('Reset (demo only)')">Reset</button></li><li>Feature flags: <code>crm.v2 = off</code></li></ul>`;
  return layout({ title: 'Settings', user, access, body });
}

export function denied({ user, access, required }) {
  const body = `<div class="denied"><p><strong>Access denied.</strong> This page requires the <code>${esc(required)}</code> tier.</p>
  <p>${access.scope ? `Your live scope is <code>${esc(access.scope)}</code>.` : 'You have <strong>no active demo access</strong>: no <code>Demo-</code> group membership was found in Okta just now.'}</p>
  <p>Ask the agent, e.g. <em>"Give ${esc(user.name)} ${esc(required)} demo access for 1 hour"</em>.</p></div>`;
  return layout({ title: 'Access denied', user, access, body });
}
