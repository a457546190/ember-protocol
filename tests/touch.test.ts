import test from 'node:test';
import assert from 'node:assert/strict';
import { joystickVector } from '../src/touch.ts';

test('the analog stick has a dead zone and cannot exceed full movement speed', () => {
  assert.deepEqual(joystickVector(0, 0), { x: 0, y: 0 });
  assert.deepEqual(joystickVector(3, 3), { x: 0, y: 0 });
  assert.deepEqual(joystickVector(1000, 0), { x: 1, y: 0 });
  const diagonal = joystickVector(100, -100);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-10);
  assert.ok(diagonal.x > 0 && diagonal.y < 0);
});

test('the stick supports arbitrary angles and scales walking speed with displacement', () => {
  const slow = joystickVector(12, 7), fast = joystickVector(36, 21);
  assert.ok(Math.hypot(slow.x, slow.y) < Math.hypot(fast.x, fast.y));
  assert.ok(Math.abs(slow.y / slow.x - 7 / 12) < 1e-10);
  assert.ok(Math.abs(fast.y / fast.x - 7 / 12) < 1e-10);
});
