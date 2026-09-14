import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCOPES, SCOPE_NAMES, DEMO_GROUP_PREFIX, groupForScope, scopeForGroup,
  highestScope, canAccess, PAGES, ACTIONS,
} from '../lib/scopes.mjs';

test('catalog has exactly three tiers mapped to Demo- groups', () => {
  assert.deepEqual(SCOPE_NAMES, ['read-only', 'editor', 'admin']);
  assert.equal(groupForScope('read-only'), 'Demo-ReadOnly');
  assert.equal(groupForScope('editor'), 'Demo-Editor');
  assert.equal(groupForScope('admin'), 'Demo-Admin');
  for (const name of SCOPE_NAMES) assert.ok(SCOPES[name].group.startsWith(DEMO_GROUP_PREFIX));
  assert.throws(() => groupForScope('owner'), /Unknown scope: owner/);
});

test('scopeForGroup is the inverse and ignores unknown groups', () => {
  assert.equal(scopeForGroup('Demo-Editor'), 'editor');
  assert.equal(scopeForGroup('Everyone'), null);
});

test('highestScope picks the strongest Demo- group', () => {
  assert.equal(highestScope(['Everyone', 'Demo-ReadOnly', 'Demo-Admin']), 'admin');
  assert.equal(highestScope(['Everyone']), null);
  assert.equal(highestScope([]), null);
});

test('canAccess compares levels', () => {
  assert.equal(canAccess('read-only', PAGES.dashboard), true);
  assert.equal(canAccess('read-only', PAGES.settings), false);
  assert.equal(canAccess('editor', ACTIONS.editRecords), true);
  assert.equal(canAccess('read-only', ACTIONS.editRecords), false);
  assert.equal(canAccess('admin', PAGES.settings), true);
  assert.equal(canAccess(null, PAGES.dashboard), false);
});
