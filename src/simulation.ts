import { C, SpatialGrid, World } from './ecs';

export type Status = 'menu' | 'playing' | 'upgrading' | 'paused' | 'won' | 'lost';
export type UpgradeId = 'power' | 'haste' | 'multishot' | 'blades' | 'arc' | 'speed' | 'magnet' | 'vitality' | 'regen';
export interface Input { x: number; y: number; dash: boolean }
export interface Effect {
  type: 'burst' | 'ring' | 'line' | 'text' | 'trail' | 'warning';
  x: number; y: number; x2?: number; y2?: number;
  life: number; max: number; color: string; size: number; text?: string;
}
export interface Upgrade { id: UpgradeId; icon: string; name: string; category: string; description: string; color: string }
export const RUN_DURATION = 180;
export const UPGRADES: Record<UpgradeId, Omit<Upgrade, 'id' | 'description'> & { max: number }> = {
  power: { icon: '✦', name: '高能弹芯', category: '伤害强化', color: '#efc786', max: 6 },
  haste: { icon: '»', name: '超频扳机', category: '射速强化', color: '#efc786', max: 5 },
  multishot: { icon: '⋔', name: '分裂弹道', category: '弹幕强化', color: '#efc786', max: 4 },
  blades: { icon: '◈', name: '公转环刃', category: '环绕武器', color: '#92dfd0', max: 5 },
  arc: { icon: 'ϟ', name: '连锁电弧', category: '范围武器', color: '#bda8f2', max: 5 },
  speed: { icon: '↗', name: '轻盈步伐', category: '机动强化', color: '#92dfd0', max: 3 },
  magnet: { icon: '◎', name: '余烬引力', category: '拾取强化', color: '#92dfd0', max: 3 },
  vitality: { icon: '♡', name: '生命容器', category: '生存强化', color: '#ee9997', max: 4 },
  regen: { icon: '✚', name: '自愈组织', category: '生存强化', color: '#ee9997', max: 3 },
};

export class Simulation {
  readonly world = new World();
  readonly grid = new SpatialGrid();
  readonly player: number;
  status: Status = 'menu';
  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  xpTotal = 0;
  damageDealt = 0;
  wave = 1;
  enemies = 0;
  collisionChecks = 0;
  dashCooldown = 0;
  dashTime = 0;
  invulnerable = 0;
  aim = -Math.PI / 2;
  facing = { x: 0, y: -1 };
  bossId = -1;
  bossSpawned = false;
  bossDefeated = false;
  rangedIntroduced = false;
  shake = 0;
  choices: Upgrade[] = [];
  effects: Effect[] = [];
  sounds: string[] = [];
  upgrades: Record<UpgradeId, number> = { power: 0, haste: 0, multishot: 0, blades: 0, arc: 0, speed: 0, magnet: 0, vitality: 0, regen: 0 };
  private spawnTimer = 0;
  private weaponTimer = 0.1;
  private arcTimer = 1;
  private bossTimer = 3;
  private bossTelegraph = 0;
  private remove = new Set<number>();
  private hitTargets = new Map<number, Set<number>>();
  private randomState: number;

  constructor(seed = Date.now()) {
    this.randomState = seed >>> 0 || 1;
    this.player = this.world.create(C.Position | C.Motion | C.Player);
    this.world.hp[this.player] = this.world.maxHp[this.player] = 100;
    this.world.radius[this.player] = 13;
  }

  random(): number {
    let n = this.randomState;
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    this.randomState = n >>> 0;
    return this.randomState / 4294967296;
  }
  get xpRequired(): number { return 8 + this.level * 6 + this.level * this.level; }
  get damageMultiplier(): number { return 1 + this.upgrades.power * 0.25; }
  get pickupRadius(): number { return 95 + this.upgrades.magnet * 65; }
  get bladeCount(): number { return this.upgrades.blades; }
  get hp(): number { return this.world.hp[this.player]; }
  get maxHp(): number { return this.world.maxHp[this.player]; }

  start(): void {
    if (this.status !== 'menu') return;
    this.status = 'playing';
    for (let i = 0; i < 15; i++) this.spawnEnemy(i % 7 === 0 ? 1 : 0, 360 + this.random() * 230);
  }

  spawnEnemy(kind: number, distance = 640, at?: { x: number; y: number }): number {
    const w = this.world;
    const id = w.create(C.Position | C.Motion | C.Enemy | (kind === 4 ? C.Ranged : 0));
    const angle = this.random() * Math.PI * 2;
    w.x[id] = at?.x ?? w.x[this.player] + Math.cos(angle) * distance;
    w.y[id] = at?.y ?? w.y[this.player] + Math.sin(angle) * distance;
    w.kind[id] = kind;
    const scale = 1 + this.time / 150;
    w.radius[id] = [14, 10, 23, 46, 18][kind];
    w.hp[id] = w.maxHp[id] = [20 * scale, 13 * scale, 95 * scale, 3600, 38 * scale][kind];
    w.speed[id] = [43 + this.time * 0.12, 91 + this.time * 0.1, 30, 105, 60][kind];
    w.damage[id] = [10, 8, 20, 28, 12][kind];
    w.value[id] = [2, 3, 8, 100, 6][kind];
    if (kind === 4) w.fireCooldown[id] = 1 + this.random() * 1.4;
    if (kind === 3) {
      this.bossId = id;
      this.bossSpawned = true;
      this.sound('boss');
      this.effect('ring', w.x[id], w.y[id], '#ff6570', 160, 1.2);
    }
    return id;
  }

  update(dt: number, input: Input): void {
    if (this.status !== 'playing') return;
    const w = this.world, p = this.player;
    this.time += dt;
    this.wave = Math.min(6, 1 + Math.floor(this.time / 30));
    this.shake = Math.max(0, this.shake - dt * 24);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    w.hp[p] = Math.min(w.maxHp[p], w.hp[p] + dt * (0.35 + this.upgrades.regen * 1.4));
    this.effects = this.effects.filter(fx => (fx.life -= dt) > 0);
    for (const id of w.dense) {
      w.flash[id] = Math.max(0, w.flash[id] - dt);
      w.cooldown[id] = Math.max(0, w.cooldown[id] - dt);
    }

    // Input + dash systems. A dash keeps its initial direction for the full burst.
    const length = Math.hypot(input.x, input.y);
    let mx = length ? input.x / Math.max(1, length) : 0;
    let my = length ? input.y / Math.max(1, length) : 0;
    if (length && this.dashTime <= 0) this.facing = { x: mx, y: my };
    if (input.dash && this.dashCooldown === 0) {
      this.dashTime = 0.19;
      this.dashCooldown = 2.5;
      this.invulnerable = Math.max(this.invulnerable, 0.28);
      this.sound('dash');
      this.effect('ring', w.x[p], w.y[p], '#94e5d3', 50, 0.3);
    }
    let speed = 205 * (1 + this.upgrades.speed * 0.12);
    if (this.dashTime > 0) {
      mx = this.facing.x; my = this.facing.y; speed = 850;
      this.effect('trail', w.x[p], w.y[p], '#8fdaca', 17, 0.24);
    }
    w.vx[p] = mx * speed; w.vy[p] = my * speed;
    w.x[p] += w.vx[p] * dt; w.y[p] += w.vy[p] * dt;
    const dist = Math.hypot(w.x[p], w.y[p]);
    if (dist > 1800) { w.x[p] *= 1800 / dist; w.y[p] *= 1800 / dist; }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const count = this.bossSpawned ? 2 : 2 + Math.floor(this.time / 22);
      if (this.enemies < 480) for (let i = 0; i < count; i++) {
        const r = this.random();
        this.spawnEnemy(this.time >= 60 && r >= 0.88 ? 4 : this.time > 25 && r < 0.16 ? 2 : r < 0.37 ? 1 : 0);
      }
      this.spawnTimer = Math.max(0.28, 1.25 - this.time / 200);
    }
    if (this.time >= 60 && !this.rangedIntroduced) {
      this.rangedIntroduced = true;
      this.spawnEnemy(4, 430);
    }
    if (this.time >= 150 && !this.bossSpawned) {
      this.spawnEnemy(3, 420, { x: w.x[p] + this.facing.x * 420, y: w.y[p] + this.facing.y * 420 });
      // The extraction relay pulls in uncollected embers for the final encounter.
      for (const id of w.query(C.Pickup)) w.speed[id] = 320;
    }

    // Chase system builds a broad-phase grid for the combat systems below.
    this.grid.clear();
    this.enemies = 0;
    let nearest = -1, nearestDist = Infinity;
    for (const id of w.query(C.Enemy)) {
      const dx = w.x[p] - w.x[id], dy = w.y[p] - w.y[id];
      const d = Math.hypot(dx, dy) || 1;
      if (d > 1100 && w.kind[id] !== 3) {
        const angle = this.random() * Math.PI * 2;
        w.x[id] = w.x[p] + Math.cos(angle) * 700;
        w.y[id] = w.y[p] + Math.sin(angle) * 700;
      } else {
        const damping = Math.exp(-8 * dt);
        w.vx[id] *= damping; w.vy[id] *= damping;
        // Spitters keep a firing distance and stand still while locking their shot.
        const movement = w.mask[id] & C.Ranged ? (w.windup[id] > 0 ? 0 : d > 340 ? 1 : d < 230 ? -0.65 : 0) : 1;
        const move = w.speed[id] * (w.flash[id] > 0 ? 0.35 : 1) * movement;
        w.x[id] += (dx / d * move + w.vx[id]) * dt;
        w.y[id] += (dy / d * move + w.vy[id]) * dt;
      }
      this.grid.insert(id, w.x[id], w.y[id]);
      this.enemies++;
      if (d < nearestDist) { nearest = id; nearestDist = d; }
    }

    // Automatic primary weapon, with additional projectiles as upgrades accumulate.
    this.weaponTimer -= dt;
    if (nearest >= 0 && nearestDist < 770) {
      // Focus the boss when it enters engagement range; secondary weapons still clear the crowd.
      const bossInRange = this.bossId >= 0 && Math.hypot(w.x[this.bossId] - w.x[p], w.y[this.bossId] - w.y[p]) < 520;
      const primaryTarget = bossInRange ? this.bossId : nearest;
      this.aim = Math.atan2(w.y[primaryTarget] - w.y[p], w.x[primaryTarget] - w.x[p]);
      if (this.weaponTimer <= 0) {
        const amount = 1 + this.upgrades.multishot;
        for (let i = 0; i < amount; i++) {
          const angle = this.aim + (i - (amount - 1) / 2) * 0.14;
          this.spawnProjectile(w.x[p] + Math.cos(angle) * 19, w.y[p] + Math.sin(angle) * 19, angle, false);
        }
        this.weaponTimer = 0.42 * Math.pow(0.86, this.upgrades.haste);
        this.sound('shot');
      }
    }

    this.arcTimer -= dt;
    if (this.upgrades.arc && this.arcTimer <= 0 && nearest >= 0 && nearestDist < 480) {
      let originX = w.x[p], originY = w.y[p];
      const targets = new Set<number>();
      let target = nearest;
      for (let bounce = 0; bounce < 2 + this.upgrades.arc; bounce++) {
        targets.add(target);
        this.effects.push({ type: 'line', x: originX, y: originY, x2: w.x[target], y2: w.y[target], life: 0.24, max: 0.24, color: '#c6b5ff', size: 3 });
        this.hit(target, (20 + this.upgrades.arc * 9) * this.damageMultiplier, 0);
        originX = w.x[target]; originY = w.y[target];
        let next = -1, min = 230;
        for (const candidate of this.grid.near(originX, originY, 230)) {
          if (targets.has(candidate) || w.hp[candidate] <= 0) continue;
          const distance = Math.hypot(w.x[candidate] - originX, w.y[candidate] - originY);
          if (distance < min) { min = distance; next = candidate; }
        }
        if (next < 0) break;
        target = next;
      }
      this.arcTimer = Math.max(0.7, 2.1 - this.upgrades.arc * 0.17);
      this.sound('arc');
    }

    this.updateRangedEnemies(dt);
    this.collisionChecks = 0;
    for (const id of w.query(C.Projectile)) {
      w.x[id] += w.vx[id] * dt; w.y[id] += w.vy[id] * dt;
      w.life[id] -= dt;
      if (w.life[id] <= 0) { this.remove.add(id); continue; }
      if (w.kind[id] === 1) {
        if (Math.hypot(w.x[id] - w.x[p], w.y[id] - w.y[p]) < w.radius[id] + w.radius[p]) {
          this.hurt(w.damage[id]); this.remove.add(id);
        }
        continue;
      }
      for (const target of this.grid.near(w.x[id], w.y[id], 60)) {
        this.collisionChecks++;
        if (w.hp[target] <= 0 || this.hitTargets.get(id)?.has(target)) continue;
        if (Math.hypot(w.x[id] - w.x[target], w.y[id] - w.y[target]) > w.radius[id] + w.radius[target]) continue;
        this.hitTargets.get(id)!.add(target);
        this.hit(target, w.damage[id], 115);
        if (--w.hp[id] <= 0) { this.remove.add(id); break; }
      }
    }

    // Orbiting blades share a per-enemy hit cooldown to avoid frame-dependent damage.
    for (const target of this.grid.near(w.x[p], w.y[p], 130)) {
      if (w.hp[target] <= 0) continue;
      for (let i = 0; i < this.bladeCount; i++) {
        const angle = this.time * 2.8 + i / this.bladeCount * Math.PI * 2;
        const bx = w.x[p] + Math.cos(angle) * 83, by = w.y[p] + Math.sin(angle) * 83;
        if (w.cooldown[target] <= 0 && Math.hypot(w.x[target] - bx, w.y[target] - by) < w.radius[target] + 18) {
          this.hit(target, (18 + this.upgrades.blades * 7) * this.damageMultiplier, 85);
          w.cooldown[target] = 0.35;
        }
      }
      if (w.hp[target] > 0 && Math.hypot(w.x[target] - w.x[p], w.y[target] - w.y[p]) < w.radius[target] + 11) this.hurt(w.damage[target]);
    }

    this.updateBoss(dt);
    // Pickup system: attracted shards retain their motion once magnetized.
    for (const id of w.query(C.Pickup)) {
      const dx = w.x[p] - w.x[id], dy = w.y[p] - w.y[id], d = Math.hypot(dx, dy);
      w.life[id] -= dt;
      if (d < this.pickupRadius || w.speed[id] > 0) {
        w.speed[id] = Math.min(650, w.speed[id] + dt * 1100);
        const step = Math.min(d, w.speed[id] * dt);
        if (d > 0) { w.x[id] += dx / d * step; w.y[id] += dy / d * step; }
        if (d < 19) {
          this.xp += w.value[id]; this.xpTotal += w.value[id];
          this.remove.add(id);
          if (this.random() < 0.16) this.sound('pickup');
        }
      }
      if (w.life[id] <= 0) this.remove.add(id);
    }
    // Destruction happens after all queries. Recycled ids cannot leak projectile hit history.
    for (const id of this.remove) { w.remove(id); this.hitTargets.delete(id); }
    this.remove.clear();

    if (this.hp <= 0) { this.status = 'lost'; this.sound('hurt'); return; }
    if (this.time >= RUN_DURATION && this.bossDefeated) { this.status = 'won'; this.sound('win'); return; }
    this.checkLevel();
  }

  spawnProjectile(x: number, y: number, angle: number, hostile: boolean, speed = hostile ? 145 : 690): number {
    const w = this.world, id = w.create(C.Position | C.Motion | C.Projectile);
    w.x[id] = x; w.y[id] = y;
    w.kind[id] = hostile ? 1 : 0;
    w.vx[id] = Math.cos(angle) * speed; w.vy[id] = Math.sin(angle) * speed;
    w.radius[id] = hostile ? 7 : 5;
    w.life[id] = hostile ? 6 : 1.25;
    w.damage[id] = hostile ? 18 : 23 * this.damageMultiplier;
    w.hp[id] = 1 + Math.floor(this.upgrades.power / 3);
    if (!hostile) this.hitTargets.set(id, new Set());
    return id;
  }

  private updateRangedEnemies(dt: number): void {
    const w = this.world, p = this.player;
    for (const id of w.query(C.Ranged)) {
      if (w.hp[id] <= 0) continue;
      const distance = Math.hypot(w.x[p] - w.x[id], w.y[p] - w.y[id]);
      if (w.windup[id] > 0) {
        w.windup[id] = Math.max(0, w.windup[id] - dt);
        if (distance > 620) {
          w.windup[id] = 0; w.fireCooldown[id] = 0.6;
        } else if (w.windup[id] === 0) {
          const angle = w.aimAngle[id];
          const bullet = this.spawnProjectile(w.x[id] + Math.cos(angle) * 27, w.y[id] + Math.sin(angle) * 27, angle, true, 220);
          w.damage[bullet] = w.damage[id];
          w.radius[bullet] = 6; w.life[bullet] = 4;
          w.fireCooldown[id] = 2.7 + this.random() * 0.7;
          this.effect('ring', w.x[bullet], w.y[bullet], '#ff6570', 20, 0.22);
          this.sound('enemyShot');
        }
      } else {
        w.fireCooldown[id] = Math.max(0, w.fireCooldown[id] - dt);
        if (w.fireCooldown[id] === 0 && distance < 540) {
          // Aim is locked before firing so stepping away from the telegraph avoids the shot.
          w.aimAngle[id] = Math.atan2(w.y[p] - w.y[id], w.x[p] - w.x[id]);
          w.windup[id] = 0.7;
        }
      }
    }
  }

  private updateBoss(dt: number): void {
    if (this.bossId < 0 || this.world.hp[this.bossId] <= 0) return;
    const w = this.world, id = this.bossId;
    this.bossTimer -= dt;
    if (this.bossTimer <= 0 && this.bossTelegraph <= 0) {
      this.bossTelegraph = 1;
      this.effect('warning', w.x[id], w.y[id], '#ff6570', 110, 1);
    }
    if (this.bossTelegraph > 0) {
      this.bossTelegraph -= dt;
      if (this.bossTelegraph <= 0) {
        const offset = Math.atan2(w.y[this.player] - w.y[id], w.x[this.player] - w.x[id]);
        for (let i = 0; i < 14; i++) this.spawnProjectile(w.x[id], w.y[id], offset + i / 14 * Math.PI * 2, true);
        this.effect('ring', w.x[id], w.y[id], '#ff6570', 135, 0.6);
        this.bossTimer = w.hp[id] < w.maxHp[id] / 2 ? 2.4 : 3.8;
      }
    }
  }

  hit(id: number, amount: number, knockback: number): void {
    const w = this.world;
    if (!w.mask[id] || w.hp[id] <= 0) return;
    this.damageDealt += Math.min(w.hp[id], amount);
    w.hp[id] -= amount; w.flash[id] = 0.085;
    const a = Math.atan2(w.y[id] - w.y[this.player], w.x[id] - w.x[this.player]);
    w.vx[id] += Math.cos(a) * knockback; w.vy[id] += Math.sin(a) * knockback;
    if (this.effects.length < 170) this.effects.push({ type: 'text', x: w.x[id], y: w.y[id] - 18, text: `${Math.round(amount)}`, color: '#f6dbac', size: 12, life: 0.55, max: 0.55 });
    if (w.hp[id] <= 0) {
      this.kills++;
      this.remove.add(id);
      this.effect('burst', w.x[id], w.y[id], w.kind[id] === 1 ? '#c3a5df' : '#df9291', w.radius[id], 0.38);
      const drop = w.create(C.Position | C.Pickup);
      w.x[drop] = w.x[id]; w.y[drop] = w.y[id];
      w.value[drop] = w.value[id]; w.radius[drop] = 4; w.life[drop] = 70;
      if (id === this.bossId) {
        this.bossId = -1; this.bossDefeated = true;
        this.shake = 13;
        this.effect('ring', w.x[id], w.y[id], '#efc786', 380, 1.4);
        this.sound('win');
      }
    }
  }

  hurt(amount: number): void {
    if (this.invulnerable > 0 || this.hp <= 0) return;
    this.world.hp[this.player] -= amount;
    this.invulnerable = 0.7; this.shake = 7;
    this.effect('ring', this.world.x[this.player], this.world.y[this.player], '#f09393', 48, 0.3);
    this.sound('hurt');
  }

  checkLevel(): void {
    if (this.xp < this.xpRequired || this.status !== 'playing') return;
    this.xp -= this.xpRequired;
    this.level++;
    this.status = 'upgrading';
    this.choices = this.offerUpgrades();
    this.sound('level');
  }

  private offerUpgrades(): Upgrade[] {
    let pool = (Object.keys(UPGRADES) as UpgradeId[]).filter(id => this.upgrades[id] < UPGRADES[id].max);
    if (this.level === 2) pool = ['blades', 'arc', 'multishot'];
    const selected: Upgrade[] = [];
    while (selected.length < 3 && pool.length) {
      const index = Math.floor(this.random() * pool.length);
      const id = pool.splice(index, 1)[0], data = UPGRADES[id];
      selected.push({ id, ...data, description: this.describeUpgrade(id) });
    }
    if (!selected.length) selected.push({ id: 'vitality', ...UPGRADES.vitality, description: '生命上限 +25，并恢复 40 点生命。' });
    return selected;
  }

  private describeUpgrade(id: UpgradeId): string {
    const lv = this.upgrades[id];
    const descriptions: Record<UpgradeId, string> = {
      power: '所有武器伤害 +25%。达到 3 / 6 级时，脉冲弹额外穿透一个敌人。',
      haste: '脉冲发射间隔缩短 14%，更快地撕开怪潮。',
      multishot: '脉冲枪每次额外发射一枚弹丸，扩大正面火力。',
      blades: lv ? '增加一枚环刃，每次命中伤害 +7。' : '解锁一枚公转环刃，持续切割身边的敌人。',
      arc: lv ? '额外连锁一个目标，电弧伤害 +9，冷却缩短。' : '解锁连锁电弧，自动打击并连锁最多三个敌人。',
      speed: '移动速度 +12%，更从容地穿过怪物之间的缝隙。',
      magnet: '余烬拾取半径 +65，无需贴近每一枚掉落。',
      vitality: '生命上限 +25，并立即恢复 40 点生命。',
      regen: '每秒额外恢复 1.4 点生命，保持战斗续航。',
    };
    return descriptions[id];
  }

  choose(index: number): void {
    if (this.status !== 'upgrading' || !this.choices[index]) return;
    const id = this.choices[index].id;
    this.upgrades[id]++;
    if (id === 'vitality') {
      this.world.maxHp[this.player] += 25;
      this.world.hp[this.player] = Math.min(this.maxHp, this.hp + 40);
    }
    this.choices = [];
    this.status = 'playing';
    this.invulnerable = Math.max(this.invulnerable, 0.8);
    this.sound('select');
    this.effect('ring', this.world.x[this.player], this.world.y[this.player], '#efc786', 120, 0.65);
    this.checkLevel();
  }

  private effect(type: Effect['type'], x: number, y: number, color: string, size: number, life: number): void {
    if (this.effects.length < 240) this.effects.push({ type, x, y, color, size, life, max: life });
  }
  private sound(name: string): void { if (this.sounds.length < 32) this.sounds.push(name); }
}
