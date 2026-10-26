import { Simulation } from '../src/simulation.ts';

for (const seed of [12345, 42, 7]) {
  const s = new Simulation(seed); s.start();
  let peak = 0;
  for (let frame = 0; frame < 240 * 60; frame++) {
    if (s.status === 'upgrading') {
      let pick = 0, highest = -Infinity;
      for (let i = 0; i < s.choices.length; i++) {
        const id = s.choices[i].id;
        const score = {
          blades: s.upgrades.blades < 2 ? 100 : 45,
          arc: s.upgrades.arc === 0 ? 90 : 55,
          power: 65, multishot: 75, haste: 60,
          vitality: s.hp < s.maxHp * 0.6 ? 120 : 30,
          regen: s.upgrades.regen === 0 ? 85 : 40,
          magnet: s.upgrades.magnet === 0 ? 80 : 20, speed: 25,
        }[id];
        if (score > highest) { highest = score; pick = i; }
      }
      s.choose(pick);
    }
    const t = s.time;
    s.update(1 / 60, { x: Math.cos(t * 0.35), y: Math.sin(t * 0.35), dash: s.hp < s.maxHp * 0.5 && s.dashCooldown === 0 });
    peak = Math.max(peak, s.world.dense.length);
    if (s.status === 'won' || s.status === 'lost') break;
  }
  console.log(JSON.stringify({ seed, status: s.status, time: Math.round(s.time), kills: s.kills, level: s.level, hp: Math.round(s.hp), bossDefeated: s.bossDefeated, bossHp: s.bossId >= 0 ? Math.round(s.world.hp[s.bossId]) : null, peak, upgrades: s.upgrades }));
}
