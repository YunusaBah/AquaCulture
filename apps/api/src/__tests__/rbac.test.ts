import assert from 'node:assert/strict';
import test from 'node:test';

import { ROLE_NAMES, hasPermissionForRole, normalizeRole } from '../config/permissions';

test('role names are limited to OWNER and WORKER', () => {
  assert.deepEqual(ROLE_NAMES, ['OWNER', 'WORKER']);
  assert.equal(normalizeRole('OWNER'), 'OWNER');
  assert.equal(normalizeRole('WORKER'), 'WORKER');
  assert.equal(normalizeRole('ROOT'), null);
});

test('owner retains all finance and inventory permissions', () => {
  assert.equal(hasPermissionForRole('OWNER', 'FINANCE_VIEW'), true);
  assert.equal(hasPermissionForRole('OWNER', 'FINANCE_MANAGE'), true);
  assert.equal(hasPermissionForRole('OWNER', 'INVENTORY_VIEW'), true);
  assert.equal(hasPermissionForRole('OWNER', 'INVENTORY_MANAGE'), true);
  assert.equal(hasPermissionForRole('OWNER', 'POND_CREATE'), true);
});

test('worker is blocked from finance and audit permissions', () => {
  assert.equal(hasPermissionForRole('WORKER', 'FINANCE_VIEW'), false);
  assert.equal(hasPermissionForRole('WORKER', 'FINANCE_MANAGE'), false);
  assert.equal(hasPermissionForRole('WORKER', 'INVENTORY_COST_VIEW'), false);
  assert.equal(hasPermissionForRole('WORKER', 'AUDIT_VIEW'), false);
  assert.equal(hasPermissionForRole('WORKER', 'TASK_COMPLETE'), true);
  assert.equal(hasPermissionForRole('WORKER', 'POND_VIEW_ASSIGNED'), true);
});
