import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalMessage } from '../lib/approval-mail';
import { canTransition, actionSchema } from '../lib/validation';

test('acceptance message describes approved membership and mentions attached PDF', () => {
  const msg = approvalMessage('Mia', 'SSV Potsdamer Straße', '29.09.2026');
  assert.match(msg.subject, /Mitgliedschaft wurde bestätigt/);
  assert.match(msg.text, /Hallo Mia/);
  assert.match(msg.text, /29.09.2026/);
  assert.match(msg.text, /PDF/);
});
test('only pending new members can be approved; retry action is parsed separately', () => {
  assert.equal(canTransition('new', 'pending', 'approve'), true);
  assert.equal(canTransition('new', 'approved', 'approve'), false);
  assert.equal(canTransition('existing', 'pending', 'approve'), false);
  assert.equal(actionSchema.safeParse({action:'send_approval'}).success, true);
});
