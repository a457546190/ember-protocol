import test from 'node:test';
import assert from 'node:assert/strict';
import { C, SpatialGrid, World } from '../src/ecs.ts';
import { Simulation } from '../src/simulation.ts';

const idle = { x: 0, y: 0, dash: false };

test('entity recycling resets component data and keeps queries valid', () => {
  const w = new World();
  const a = w.create(C.Position | C.Enemy), b = w.create(C.Position | C.Pickup);
  w.hp[a] = 120; w.vx[a] = 90; w.kind[a] = 3;
  w.fireCooldown[a] = 3; w.windup[a] = 0.7; w.aimAngle[a] = 2;
  w.remove(a);
  assert.deepEqual([...w.query(C.Position)], [b]);
  const recycled = w.create(C.Position | C.Projectile);
  assert.equal(recycled, a);
  assert.equal(w.hp[a], 0); assert.equal(w.kind[a], 0); assert.equal(w.vx[a], 0);
  assert.equal(w.fireCooldown[a], 0); assert.equal(w.windup[a], 0); assert.equal(w.aimAngle[a], 0);
  w.remove(b); w.remove(b);
  assert.deepEqual([...w.query(C.Projectile)], [a]);
});

test('spatial broad phase covers negative coordinates and cell boundaries, then clears', () => {
  const grid = new SpatialGrid(96);
  grid.insert(1, -1, 0); grid.insert(2, 96, 1); grid.insert(3, 500, 500);
  assert.deepEqual([...grid.near(0, 0, 100)].sort(), [1, 2]);
  grid.clear();
  assert.deepEqual([...grid.near(0, 0, 100)], []);
});

test('diagonal input is normalized and dash grants invulnerability with a cooldown', () => {
  const sim = new Simulation(42); sim.status = 'playing';
  sim.update(1 / 60, { x: 1, y: 1, dash: false });
  assert.ok(Math.abs(Math.hypot(sim.world.vx[sim.player], sim.world.vy[sim.player]) - 205) < 0.01);
  sim.update(1 / 60, { x: 1, y: 0, dash: true });
  assert.equal(sim.dashCooldown, 2.5);
  const health = sim.hp;
  sim.hurt(99); assert.equal(sim.hp, health);
  sim.update(1 / 60, { x: 0, y: 1, dash: true });
  assert.ok(sim.dashCooldown < 2.5);
  assert.ok(sim.world.vx[sim.player] > 800, 'a dash preserves its initial direction');
});

test('a pulse projectile kills an enemy once, removes it safely, and drops experience', () => {
  const sim = new Simulation(1); sim.status = 'playing';
  const target = sim.spawnEnemy(0, 0, { x: 65, y: 0 });
  sim.world.speed[target] = 0;
  sim.spawnProjectile(0, 0, 0, false);
  for (let i = 0; i < 8; i++) sim.update(1 / 60, idle);
  assert.ok(sim.kills >= 1);
  assert.equal(sim.world.mask[target] & C.Enemy, 0);
  assert.ok(sim.xp > 0 || [...sim.world.query(C.Pickup)].length > 0);
  assert.ok(sim.damageDealt >= 20);
});

test('upgrade pauses time, grants its effect, and handles multiple banked levels', () => {
  const sim = new Simulation(2); sim.start();
  sim.xp = 1000; sim.checkLevel();
  assert.equal(sim.status, 'upgrading'); assert.equal(sim.level, 2);
  const before = sim.time; sim.update(1, idle); assert.equal(sim.time, before);
  assert.equal(new Set(sim.choices.map(c => c.id)).size, 3);
  const index = sim.choices.findIndex(c => c.id === 'blades');
  assert.match(sim.choices[index].description, /一枚公转环刃/);
  sim.choose(index);
  assert.equal(sim.upgrades.blades, 1); assert.equal(sim.bladeCount, 1);
  assert.equal(sim.status, 'upgrading'); assert.equal(sim.level, 3);
});

test('blade upgrades add one blade per level, beginning with a single blade', () => {
  const sim = new Simulation(9);
  assert.equal(sim.bladeCount, 0);
  for (let level = 1; level <= 5; level++) {
    sim.upgrades.blades = level;
    assert.equal(sim.bladeCount, level);
  }
});

test('ranged enemies first enter the spawn pool at one minute', () => {
  const sim = new Simulation(12); sim.status = 'playing'; sim.time = 59.98;
  sim.update(1 / 60, idle);
  assert.equal(sim.rangedIntroduced, false);
  assert.equal([...sim.world.query(C.Ranged)].length, 0);
  sim.update(1 / 60, idle);
  assert.equal(sim.rangedIntroduced, true);
  assert.ok([...sim.world.query(C.Ranged)].length >= 1);
  assert.ok([...sim.world.query(C.Ranged)].every(id => sim.world.kind[id] === 4));
});

test('a spitter holds its range, telegraphs its locked aim, then fires a dodgeable shot', () => {
  const sim = new Simulation(13); sim.status = 'playing';
  const w = sim.world, id = sim.spawnEnemy(4, 0, { x: 320, y: 0 });
  w.hp[id] = w.maxHp[id] = 10000;
  w.fireCooldown[id] = 0;
  sim.update(1 / 60, idle);
  assert.ok(w.windup[id] > 0);
  assert.equal([...w.query(C.Projectile)].filter(b => w.kind[b] === 1).length, 0);
  assert.equal(w.x[id], 320, 'spitters stop at their preferred engagement range');
  const lockedAngle = w.aimAngle[id], windup = w.windup[id];
  sim.status = 'paused'; sim.update(1, idle);
  assert.equal(w.windup[id], windup, 'pause freezes the windup');
  sim.status = 'playing';
  for (let i = 0; i < 45; i++) sim.update(1 / 60, { x: 0, y: 1, dash: false });
  assert.equal(w.aimAngle[id], lockedAngle, 'the shot must not track the player after locking');
  const bullet = [...w.query(C.Projectile)].find(b => w.kind[b] === 1)!;
  assert.notEqual(bullet, undefined);
  assert.ok(w.vx[bullet] < 0); assert.ok(Math.abs(w.vy[bullet]) < 0.001);
  assert.ok(Math.abs(Math.hypot(w.vx[bullet], w.vy[bullet]) - 220) < 0.01);
  assert.equal(w.damage[bullet], 12);
  assert.ok(w.fireCooldown[id] > 2);
});

test('a hostile projectile damages the player and is consumed on impact', () => {
  const sim = new Simulation(14); sim.status = 'playing';
  const bullet = sim.spawnProjectile(65, 0, Math.PI, true, 220);
  for (let i = 0; i < 20; i++) sim.update(1 / 60, idle);
  assert.ok(sim.hp < 90);
  assert.equal(sim.world.mask[bullet] & C.Projectile, 0);
});

test('pause freezes combat and death takes precedence over an available upgrade', () => {
  const sim = new Simulation(3); sim.start(); sim.status = 'paused';
  sim.update(2, { x: 1, y: 0, dash: false }); assert.equal(sim.time, 0);
  sim.status = 'playing'; sim.world.hp[sim.player] = -10; sim.xp = 999;
  sim.update(1 / 60, idle); assert.equal(sim.status, 'lost');
});

test('boss spawns at 02:30, emits dodgeable projectiles, and victory requires both objectives', () => {
  const sim = new Simulation(7); sim.start(); sim.time = 149.99;
  sim.update(1 / 60, idle);
  assert.ok(sim.bossId >= 0); assert.ok(sim.bossSpawned);
  assert.equal(sim.world.maxHp[sim.bossId], 3600);
  for (let i = 0; i < 245; i++) { sim.invulnerable = 1; sim.update(1 / 60, idle); }
  assert.ok([...sim.world.query(C.Projectile)].some(id => sim.world.kind[id] === 1 && Math.abs(Math.hypot(sim.world.vx[id], sim.world.vy[id]) - 145) < 0.01));
  sim.hit(sim.bossId, 99999, 0);
  sim.update(1 / 60, idle);
  assert.ok(sim.bossDefeated); assert.equal(sim.bossId, -1);
  while (sim.status === 'upgrading') sim.choose(0);
  assert.equal(sim.status, 'playing');
  sim.time = 180; sim.update(1 / 60, idle);
  assert.equal(sim.status, 'won');
});

test('a full deterministic run keeps data finite and the entity population bounded', () => {
  const sim = new Simulation(12345); sim.start();
  let peak = 0;
  for (let frame = 0; frame < 240 * 60; frame++) {
    if (sim.status === 'upgrading') {
      const priority = ['blades', 'arc', 'multishot', 'power', 'haste', 'regen', 'vitality'];
      let pick = 0, rank = Infinity;
      sim.choices.forEach((c, i) => { const r = priority.indexOf(c.id); if (r >= 0 && r < rank) { rank = r; pick = i; } });
      sim.choose(pick);
    }
    sim.invulnerable = 1;
    const t = frame / 60;
    sim.update(1 / 60, { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7), dash: false });
    peak = Math.max(peak, sim.world.dense.length);
    for (const id of sim.world.dense) {
      assert.ok(Number.isFinite(sim.world.x[id])); assert.ok(Number.isFinite(sim.world.y[id]));
    }
    if (sim.status === 'won') break;
  }
  assert.ok(sim.kills > 100, `expected combat activity, got ${sim.kills} kills`);
  assert.ok(sim.level > 5, `expected progression, got level ${sim.level}`);
  assert.ok(peak < 3000, `peak population: ${peak}`);
  assert.ok(sim.bossSpawned);
  assert.ok(sim.bossDefeated);
  assert.equal(sim.status, 'won');
  console.log(`Full run: ${sim.kills} kills, level ${sim.level}, ${peak} peak entities, boss defeated: ${sim.bossDefeated}`);
});
