import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { SCOPE_NAMES, SCOPES } from './scopes.mjs';

export class IntentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntentError';
  }
}

export const IntentSchema = z.object({
  user_id: z.string().nullable(),
  scope: z.enum(SCOPE_NAMES).nullable(),
  duration_minutes: z.number().int().positive().nullable(),
  module: z.string().nullable(),
  ambiguity: z.string().nullable(),
});

const SYSTEM_PROMPT = [
  'You parse requests to grant time-boxed demo-environment access to an existing employee.',
  'You are given the roster of employees. Return the Okta user id of the ONE employee the request refers to.',
  'Match by name, login/email, or job title (e.g. "the AE" means the Account Executive). If zero or more than one employee matches, return user_id null and explain in ambiguity.',
  'Scopes, from least to most privileged:',
  ...SCOPE_NAMES.map((name) => `- "${name}": ${SCOPES[name].description}`),
  'Words like "view", "read", "look at" mean read-only. "Edit", "modify", "update" mean editor. "Admin", "full", "settings" mean admin. If no scope is stated, return scope null.',
  'duration_minutes is the requested access window in whole minutes. Convert hours/days. For "until <time>", compute minutes from the current time given. If no duration is stated, return null.',
  'module is the named product area if any (e.g. "crm"), else null.',
  'If the request is not a request to grant demo access (for example deleting an account), return every field null and explain in ambiguity.',
  'Never invent an employee, scope or duration that is not in the request.',
].join('\n');

export function buildUserMessage({ prompt, roster, now = new Date() }) {
  const rosterLines = roster.map((u) => `- id=${u.id} | name=${u.name} | login=${u.login} | title=${u.title || '(none)'}`);
  return [
    `Current time: ${now.toISOString()}`,
    '',
    'Employee roster:',
    ...rosterLines,
    '',
    'Request:',
    prompt,
  ].join('\n');
}

export async function parseIntent({ prompt, roster, now = new Date(), client, model }) {
  const response = await client.messages.parse({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage({ prompt, roster, now }) }],
    output_config: { format: zodOutputFormat(IntentSchema), effort: 'low' },
  });
  if (response.stop_reason === 'refusal') throw new IntentError('The model declined to interpret this request');
  if (!response.parsed_output) throw new IntentError('The model returned no structured intent');
  return response.parsed_output;
}

export function validateIntent(intent, { maxDurationMinutes = 1440 } = {}) {
  const problems = [];
  const why = intent.ambiguity ? ` (${intent.ambiguity})` : '';
  if (!intent.user_id) problems.push(`could not identify a single employee${why}`);
  if (!intent.scope) problems.push(`no access scope stated; use one of ${SCOPE_NAMES.join(', ')}`);
  if (!intent.duration_minutes) problems.push('no duration stated (e.g. "for 2 hours")');
  else if (intent.duration_minutes > maxDurationMinutes) problems.push(`duration ${intent.duration_minutes} minutes exceeds the maximum of ${maxDurationMinutes}`);
  return problems;
}
