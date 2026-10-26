/** Component masks describe data presence. Entity ids index the SoA storage. */
export const C = { Position: 1, Motion: 2, Enemy: 4, Projectile: 8, Pickup: 16, Player: 32, Ranged: 64 } as const;
export const CAPACITY = 16384;

export class World {
  readonly mask = new Uint16Array(CAPACITY);
  readonly x = new Float32Array(CAPACITY);
  readonly y = new Float32Array(CAPACITY);
  readonly vx = new Float32Array(CAPACITY);
  readonly vy = new Float32Array(CAPACITY);
  readonly hp = new Float32Array(CAPACITY);
  readonly maxHp = new Float32Array(CAPACITY);
  readonly radius = new Float32Array(CAPACITY);
  readonly speed = new Float32Array(CAPACITY);
  readonly damage = new Float32Array(CAPACITY);
  readonly life = new Float32Array(CAPACITY);
  readonly flash = new Float32Array(CAPACITY);
  readonly cooldown = new Float32Array(CAPACITY);
  readonly fireCooldown = new Float32Array(CAPACITY);
  readonly windup = new Float32Array(CAPACITY);
  readonly aimAngle = new Float32Array(CAPACITY);
  readonly kind = new Uint8Array(CAPACITY);
  readonly value = new Float32Array(CAPACITY);
  readonly dense: number[] = [];
  private readonly sparse = new Int32Array(CAPACITY);
  private free: number[] = [];
  private next = 0;

  create(mask: number): number {
    const id = this.free.pop() ?? this.next++;
    if (id >= CAPACITY) throw new Error('Entity capacity exceeded');
    this.mask[id] = mask;
    this.sparse[id] = this.dense.length;
    this.dense.push(id);
    this.x[id] = this.y[id] = this.vx[id] = this.vy[id] = 0;
    this.hp[id] = this.maxHp[id] = this.radius[id] = this.speed[id] = 0;
    this.damage[id] = this.life[id] = this.flash[id] = this.cooldown[id] = 0;
    this.fireCooldown[id] = this.windup[id] = this.aimAngle[id] = 0;
    this.kind[id] = this.value[id] = 0;
    return id;
  }

  remove(id: number): void {
    if (!this.mask[id]) return;
    const index = this.sparse[id];
    const last = this.dense.pop()!;
    if (last !== id) {
      this.dense[index] = last;
      this.sparse[last] = index;
    }
    this.mask[id] = 0;
    this.free.push(id);
  }

  *query(mask: number): Generator<number> {
    for (const id of this.dense) if ((this.mask[id] & mask) === mask) yield id;
  }
}

/** Broad phase: query only cells intersecting a collision circle. */
export class SpatialGrid {
  private cells = new Map<string, number[]>();
  constructor(readonly size = 96) {}
  clear(): void { for (const ids of this.cells.values()) ids.length = 0; }
  insert(id: number, x: number, y: number): void {
    const key = `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`;
    let ids = this.cells.get(key);
    if (!ids) this.cells.set(key, ids = []);
    ids.push(id);
  }
  *near(x: number, y: number, radius: number): Generator<number> {
    for (let cy = Math.floor((y - radius) / this.size); cy <= Math.floor((y + radius) / this.size); cy++) {
      for (let cx = Math.floor((x - radius) / this.size); cx <= Math.floor((x + radius) / this.size); cx++) {
        const ids = this.cells.get(`${cx},${cy}`);
        if (ids) yield* ids;
      }
    }
  }
}
