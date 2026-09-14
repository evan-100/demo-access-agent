import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IntentSchema, buildUserMessage, parseIntent, validateIntent, IntentError } from '../lib/intent.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/intent-cases.json', import.meta.url), 'utf8'));

test('IntentSchema accepts a complete intent and rejects a bad scope', () => {
  assert.ok(IntentSchema.safeParse({ user_id: '00uAE', scope: 'editor', duration_minutes: 30, module: 'crm', ambiguity: null }).success);
  assert.equal(IntentSchema.safeParse({ user_id: '00uAE', scope: 'owner', duration_minutes: 30, module: null, ambiguity: null }).success, false);
});

test('buildUserMessage embeds the roster, the current time and the prompt', () => {
  const msg = buildUserMessage({ prompt: 'Give the AE access', roster: fixture.roster, now: new Date(fixture.now) });
  assert.match(msg, /id=00uAE \| name=Ava Chen \| login=ava\.chen@example\.com \| title=Account Executive/);
  assert.match(msg, /2026-09-14T15:00:00\.000Z/);
  assert.match(msg, /Give the AE access/);
});

test('parseIntent returns parsed_output from the client', async () => {
  let captured;
  const client = { messages: { parse: async (params) => { captured = params; return { stop_reason: 'end_turn', parsed_output: { user_id: '00uAE', scope: 'read-only', duration_minutes: 120, module: 'crm', ambiguity: null } }; } } };
  const intent = await parseIntent({ prompt: 'x', roster: fixture.roster, now: new Date(fixture.now), client, model: 'claude-opus-5' });
  assert.equal(intent.scope, 'read-only');
  assert.equal(captured.model, 'claude-opus-5');
  assert.ok(captured.output_config.format);
  assert.equal(captured.output_config.effort, 'low');
});

test('parseIntent throws IntentError on refusal or null output', async () => {
  const refusing = { messages: { parse: async () => ({ stop_reason: 'refusal', parsed_output: null }) } };
  await assert.rejects(() => parseIntent({ prompt: 'x', roster: [], client: refusing, model: 'm' }), IntentError);
  const empty = { messages: { parse: async () => ({ stop_reason: 'end_turn', parsed_output: null }) } };
  await assert.rejects(() => parseIntent({ prompt: 'x', roster: [], client: empty, model: 'm' }), IntentError);
});

test('validateIntent lists every problem', () => {
  assert.deepEqual(validateIntent({ user_id: '00uAE', scope: 'editor', duration_minutes: 30, module: null, ambiguity: null }), []);
  const problems = validateIntent({ user_id: null, scope: null, duration_minutes: null, module: null, ambiguity: 'no name given' });
  assert.equal(problems.length, 3);
  assert.match(problems[0], /employee/);
  assert.match(problems[1], /scope/);
  assert.match(problems[2], /duration/);
  assert.match(validateIntent({ user_id: 'u', scope: 'admin', duration_minutes: 99999, module: null, ambiguity: null })[0], /exceeds the maximum of 1440/);
});
