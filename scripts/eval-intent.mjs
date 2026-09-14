import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { loadDotEnv } from '../lib/config.mjs';
import { parseIntent } from '../lib/intent.mjs';

loadDotEnv();
const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const fixture = JSON.parse(readFileSync(new URL('../test/fixtures/intent-cases.json', import.meta.url), 'utf8'));
const client = new Anthropic();
const now = new Date(fixture.now);

const fields = ['user_id', 'scope', 'duration_minutes'];
const tally = Object.fromEntries(fields.map((f) => [f, { checked: 0, correct: 0 }]));
let allCorrect = 0;

for (const c of fixture.cases) {
  const intent = await parseIntent({ prompt: c.prompt, roster: fixture.roster, now, client, model });
  const misses = [];
  for (const f of fields) {
    if (!(f in c.expect)) continue;
    tally[f].checked += 1;
    if (intent[f] === c.expect[f]) tally[f].correct += 1;
    else misses.push(`${f}: expected ${JSON.stringify(c.expect[f])}, got ${JSON.stringify(intent[f])}`);
  }
  if (!misses.length) allCorrect += 1;
  console.log(`${misses.length ? 'FAIL' : 'PASS'}  ${c.prompt}`);
  for (const m of misses) console.log(`      ${m}`);
}

const pct = (t) => (t.checked ? `${((t.correct / t.checked) * 100).toFixed(1)}% (${t.correct}/${t.checked})` : 'n/a');
console.log('');
console.log(`model: ${model}`);
console.log(`employee accuracy: ${pct(tally.user_id)}`);
console.log(`scope accuracy:    ${pct(tally.scope)}`);
console.log(`duration accuracy: ${pct(tally.duration_minutes)}`);
console.log(`overall:           ${((allCorrect / fixture.cases.length) * 100).toFixed(1)}% (${allCorrect}/${fixture.cases.length} cases fully correct)`);
process.exit(allCorrect === fixture.cases.length ? 0 : 1);
