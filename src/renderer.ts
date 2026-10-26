import { C } from './ecs';
import { Simulation, type Effect } from './simulation';

const TAU = Math.PI * 2;
const noise = (x: number, y: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  scale = 1;
  private cameraX = 0;
  private cameraY = 0;
  private dpr = 1;
  private clock = 0;
  private groundPattern?: CanvasPattern;
  private spriteCache = new Map<string, HTMLCanvasElement>();
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.scale = this.width < 700 ? 0.72 : Math.min(1.15, Math.max(0.85, this.height / 860));
  }

  draw(sim: Simulation, dt: number): void {
    const c = this.ctx, w = sim.world, p = sim.player;
    this.clock += dt;
    const menu = sim.status === 'menu';
    const targetX = w.x[p] - (menu ? (this.width > 760 ? 230 : 210) : 0);
    this.cameraX += (targetX - this.cameraX) * Math.min(1, dt * 8);
    this.cameraY += (w.y[p] - this.cameraY) * Math.min(1, dt * 8);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#101d20'; c.fillRect(0, 0, this.width, this.height);
    c.save();
    c.translate(this.width / 2 + Math.sin(this.clock * 121) * sim.shake, this.height / 2 + Math.cos(this.clock * 97) * sim.shake);
    c.scale(this.scale, this.scale);
    c.translate(-this.cameraX, -this.cameraY);
    this.ground();
    this.landmarks();

    if (menu) this.attractScene();
    // Pickups are deliberately bright and drawn beneath actors.
    for (const id of w.query(C.Pickup)) {
      const x = w.x[id], y = w.y[id];
      if (!this.visible(x, y)) continue;
      const large = w.value[id] >= 8;
      c.fillStyle = large ? '#f1c984' : '#8bdbca';
      c.globalAlpha = 0.1;
      this.circle(x, y, large ? 15 : 10); c.fill();
      c.globalAlpha = 0.9;
      const s = large ? 6 : 4;
      c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.7, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.7, y); c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
    if (sim.bladeCount) {
      c.strokeStyle = '#8bdbca20'; c.lineWidth = 1;
      this.circle(w.x[p], w.y[p], 83); c.stroke();
    }

    for (const id of w.query(C.Ranged)) {
      if (w.windup[id] <= 0 || !this.visible(w.x[id], w.y[id], 550)) continue;
      const angle = w.aimAngle[id], charge = 1 - w.windup[id] / 0.7;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      c.save();
      c.strokeStyle = '#ff6873'; c.lineWidth = 1.3; c.globalAlpha = 0.16 + charge * 0.3;
      c.setLineDash([5, 9]);
      c.beginPath(); c.moveTo(w.x[id] + dx * 27, w.y[id] + dy * 27); c.lineTo(w.x[id] + dx * 540, w.y[id] + dy * 540); c.stroke();
      c.setLineDash([]); c.globalAlpha = 0.45 + charge * 0.4;
      c.fillStyle = '#ff6772'; this.circle(w.x[id] + dx * 27, w.y[id] + dy * 27, 3 + charge * 4); c.fill();
      c.restore();
    }

    for (const id of w.query(C.Enemy)) {
      if (!this.visible(w.x[id], w.y[id], 100)) continue;
      const facing = w.mask[id] & C.Ranged && w.windup[id] > 0 ? w.aimAngle[id] : Math.atan2(w.y[p] - w.y[id], w.x[p] - w.x[id]);
      this.enemy(w.x[id], w.y[id], w.kind[id], facing, w.flash[id] > 0, id);
      if (w.kind[id] === 2 && w.hp[id] < w.maxHp[id]) {
        c.fillStyle = '#0007'; c.fillRect(w.x[id] - 17, w.y[id] - 35, 34, 3);
        c.fillStyle = '#d3b079'; c.fillRect(w.x[id] - 17, w.y[id] - 35, 34 * Math.max(0, w.hp[id] / w.maxHp[id]), 3);
      }
    }

    for (const fx of sim.effects) if (fx.type === 'trail' || fx.type === 'warning') this.effect(fx);
    this.player(w.x[p], w.y[p], sim.aim, sim.invulnerable > 0, Math.hypot(w.vx[p], w.vy[p]) > 1, sim.status === 'lost');

    for (let i = 0; i < sim.bladeCount; i++) {
      const angle = sim.time * 2.8 + i / sim.bladeCount * TAU;
      const x = w.x[p] + Math.cos(angle) * 83, y = w.y[p] + Math.sin(angle) * 83;
      c.save(); c.translate(x, y); c.rotate(angle + Math.PI / 2);
      c.strokeStyle = '#91e7d4'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-8, 14); c.quadraticCurveTo(-17, 0, -5, -17); c.quadraticCurveTo(-3, 0, 8, 11); c.stroke();
      c.fillStyle = '#d2fff1'; c.beginPath(); c.moveTo(0, -17); c.lineTo(5, 7); c.lineTo(-4, 3); c.closePath(); c.fill();
      c.restore();
    }

    c.lineCap = 'round';
    for (const id of w.query(C.Projectile)) {
      if (!this.visible(w.x[id], w.y[id])) continue;
      const hostile = w.kind[id] === 1;
      const speed = Math.hypot(w.vx[id], w.vy[id]) || 1;
      const dx = w.vx[id] / speed, dy = w.vy[id] / speed;
      c.strokeStyle = hostile ? '#f43f554a' : '#f5c67a38'; c.lineWidth = hostile ? 12 : 9;
      c.beginPath(); c.moveTo(w.x[id] - dx * 22, w.y[id] - dy * 22); c.lineTo(w.x[id], w.y[id]); c.stroke();
      c.strokeStyle = hostile ? '#ff5b68' : '#f9d99b'; c.lineWidth = hostile ? 6 : 3;
      c.beginPath(); c.moveTo(w.x[id] - dx * 11, w.y[id] - dy * 11); c.lineTo(w.x[id], w.y[id]); c.stroke();
      c.fillStyle = hostile ? '#ffe0da' : '#fff5d9'; this.circle(w.x[id], w.y[id], hostile ? 2.5 : 2); c.fill();
    }
    c.lineCap = 'butt';
    for (const fx of sim.effects) if (fx.type !== 'trail' && fx.type !== 'warning') this.effect(fx);
    c.restore();

    // A restrained vignette keeps the action readable and frames the HUD.
    const vignette = c.createRadialGradient(this.width / 2, this.height / 2, this.height * 0.15, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.7);
    vignette.addColorStop(0, '#060e1000'); vignette.addColorStop(1, '#060e10ba');
    c.fillStyle = vignette; c.fillRect(0, 0, this.width, this.height);
    if (sim.hp < sim.maxHp * 0.3 && sim.status === 'playing') {
      c.strokeStyle = `rgba(220,80,90,${0.12 + Math.sin(this.clock * 4) * 0.06})`;
      c.lineWidth = 24; c.strokeRect(0, 0, this.width, this.height);
    }
  }

  private visible(x: number, y: number, margin = 40): boolean {
    return Math.abs(x - this.cameraX) < this.width / 2 / this.scale + margin && Math.abs(y - this.cameraY) < this.height / 2 / this.scale + margin;
  }

  private ground(): void {
    const c = this.ctx;
    if (!this.groundPattern) {
      const terrain = document.createElement('canvas');
      terrain.width = terrain.height = 720;
      this.paintTerrain(terrain.getContext('2d')!);
      this.groundPattern = c.createPattern(terrain, 'repeat')!;
    }
    c.fillStyle = this.groundPattern;
    c.fillRect(this.cameraX - this.width / 2 / this.scale - 2, this.cameraY - this.height / 2 / this.scale - 2, this.width / this.scale + 4, this.height / this.scale + 4);
    // Physical world boundary: clear to the player, and constrained by simulation.
    c.strokeStyle = '#9de4d128'; c.lineWidth = 3;
    this.circle(0, 0, 1800); c.stroke();
    c.setLineDash([8, 16]); c.strokeStyle = '#9de4d111'; this.circle(0, 0, 1788); c.stroke(); c.setLineDash([]);
  }

  private paintTerrain(c: CanvasRenderingContext2D): void {
    const tile = 90, left = 0, top = 0, cols = 8, rows = 8;
    for (let gy = top; gy < top + rows; gy++) for (let gx = left; gx < left + cols; gx++) {
      const n = noise(gx, gy), x = gx * tile, y = gy * tile;
      c.fillStyle = n > 0.58 ? '#132225' : n > 0.28 ? '#122023' : '#111f22';
      c.fillRect(x, y, tile, tile);
      if (n > 0.85) {
        c.fillStyle = '#1b2c2b'; c.beginPath(); c.ellipse(x + 40, y + 50, 32, 18, n * 5, 0, TAU); c.fill();
      }
      c.strokeStyle = '#8cb0a908'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y + tile); c.lineTo(x + tile, y + tile); c.lineTo(x + tile, y); c.stroke();
      // Deterministic clumps of grass and weathered stones.
      for (let k = 0; k < 3; k++) {
        const r = noise(gx * 4 + k, gy * 4 - k);
        const px = x + r * 80 + 5, py = y + noise(gx - k, gy + 6 + k) * 80 + 5;
        if (r < 0.65) {
          c.strokeStyle = r > 0.3 ? '#4860564a' : '#29473e70'; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(px - 4, py - 5); c.lineTo(px, py); c.lineTo(px + 2, py - 8); c.moveTo(px, py); c.lineTo(px + 7, py - 4); c.stroke();
        } else {
          c.fillStyle = '#0c171a';
          c.beginPath(); c.moveTo(px - 5, py); c.lineTo(px - 3, py - 5); c.lineTo(px + 3, py - 7); c.lineTo(px + 8, py - 2); c.lineTo(px + 6, py + 2); c.closePath(); c.fill();
          c.strokeStyle = '#3a4e4c66'; c.beginPath(); c.moveTo(px - 3, py - 5); c.lineTo(px + 3, py - 7); c.lineTo(px + 7, py - 3); c.stroke();
        }
      }
    }
  }

  private landmarks(): void {
    const c = this.ctx;
    // The abandoned relay at spawn is a navigational landmark.
    if (this.visible(0, 0, 180)) {
      c.save(); c.globalAlpha = 0.65;
      c.strokeStyle = '#56716a40'; c.lineWidth = 2;
      this.circle(0, 0, 132); c.stroke();
      c.setLineDash([3, 15]); this.circle(0, 0, 118); c.stroke(); c.setLineDash([]);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        c.save(); c.translate(Math.cos(a) * 132, Math.sin(a) * 132); c.rotate(a);
        c.fillStyle = '#213133'; c.fillRect(-9, -5, 18, 10);
        c.fillStyle = i % 2 ? '#6a86794a' : '#efc78680'; c.fillRect(-4, -2, 8, 4);
        c.restore();
      }
      c.strokeStyle = '#91b5a520'; c.beginPath(); c.moveTo(-36, 0); c.lineTo(36, 0); c.moveTo(0, -36); c.lineTo(0, 36); c.stroke();
      c.font = '9px monospace'; c.fillStyle = '#8eaaa34a'; c.textAlign = 'center'; c.fillText('RELAY  /  07', 0, 163);
      c.restore();
    }
    for (const [x, y, a] of [[-410, -250, 0.3], [540, 290, -0.5], [-300, 500, 1.2], [810, -600, 0.8], [-900, -700, -0.2], [250, -1000, 0.6]]) {
      if (!this.visible(x, y, 90)) continue;
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = '#0a141770'; c.beginPath(); c.ellipse(10, 12, 55, 22, 0, 0, TAU); c.fill();
      c.fillStyle = '#223032'; c.strokeStyle = '#40504a'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-32, 5); c.lineTo(-21, -38); c.lineTo(15, -48); c.lineTo(38, -13); c.lineTo(29, 13); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#101e20'; c.beginPath(); c.moveTo(-21, -38); c.lineTo(-4, -7); c.lineTo(29, 13); c.moveTo(-4, -7); c.lineTo(15, -48); c.stroke();
      c.fillStyle = '#86c4af'; c.globalAlpha = 0.4;
      c.fillRect(-7, -33, 3, 17); c.fillRect(-12, -27, 13, 3);
      c.restore();
    }
  }

  private player(x: number, y: number, aim: number, invulnerable: boolean, moving: boolean, dead: boolean): void {
    const c = this.ctx, bob = moving ? Math.sin(this.clock * 17) * 2 : Math.sin(this.clock * 2) * 1;
    c.save(); c.translate(x, y);
    if (dead) c.rotate(-0.8);
    c.fillStyle = '#050d10a0'; c.beginPath(); c.ellipse(0, 15, 18, 8, 0, 0, TAU); c.fill();
    c.fillStyle = '#ecc17e0c'; this.circle(0, 0, 45); c.fill();
    if (invulnerable) {
      c.strokeStyle = '#a9eee0'; c.globalAlpha = 0.4 + Math.sin(this.clock * 30) * 0.25;
      c.lineWidth = 1.5; this.circle(0, 0, 26); c.stroke(); c.globalAlpha = 0.85;
    }
    c.translate(0, bob);
    // Split coat silhouette, boots, shoulder armour and a luminous visor.
    c.fillStyle = '#102529'; c.fillRect(-9, 7, 7, 13); c.fillRect(3, 7, 7, 13);
    c.fillStyle = '#c6b791'; c.fillRect(-10, 17, 8, 4); c.fillRect(3, 17, 8, 4);
    c.fillStyle = '#537b72'; c.strokeStyle = '#8eae94'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-11, -9); c.lineTo(10, -9); c.lineTo(16, 15); c.lineTo(5, 12); c.lineTo(0, 17); c.lineTo(-16, 14); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ccae78'; c.beginPath(); c.moveTo(-11, -9); c.lineTo(-18, -4); c.lineTo(-15, 6); c.lineTo(-6, 2); c.lineTo(9, 7); c.lineTo(15, 0); c.lineTo(10, -10); c.closePath(); c.fill();
    c.fillStyle = '#243b3c'; c.fillRect(-5, -3, 11, 10);
    c.fillStyle = '#efd7a1'; c.beginPath(); c.ellipse(0, -12, 11, 12, 0, 0, TAU); c.fill();
    c.fillStyle = '#203b3e'; c.beginPath(); c.roundRect(-9, -15, 18, 8, 3); c.fill();
    c.fillStyle = '#a6f3df'; c.fillRect(-6, -13, 12, 3);
    c.save(); c.rotate(aim);
    c.fillStyle = '#13292e'; c.fillRect(10, -4, 20, 8);
    c.fillStyle = '#bfbda3'; c.fillRect(14, -4, 13, 5);
    c.fillStyle = '#f9d69c'; c.fillRect(27, -2, 4, 3);
    c.restore();
    c.restore();
    if (!dead) {
      c.fillStyle = '#f1d194'; c.globalAlpha = 0.5;
      this.circle(x + Math.cos(this.clock) * 21, y - 34 + Math.sin(this.clock * 2) * 3, 2); c.fill(); c.globalAlpha = 1;
    }
  }

  private enemy(x: number, y: number, kind: number, aim: number, flash: boolean, seed: number): void {
    if (kind === 3) { this.paintEnemy(x, y, kind, aim, flash, seed); return; }
    const c = this.ctx;
    const frame = Math.floor(((this.clock * (kind === 1 ? 12 : 6) + seed) / (Math.PI / 2)) % 4);
    const key = `${kind}:${Number(flash)}:${frame}`;
    let sprite = this.spriteCache.get(key);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = 144; sprite.height = 160;
      const cachedContext = sprite.getContext('2d')!;
      cachedContext.scale(2, 2);
      const clock = this.clock;
      this.ctx = cachedContext; this.clock = 0;
      this.paintEnemy(36, 40, kind, -Math.PI / 2, flash, frame * Math.PI / 2);
      this.ctx = c; this.clock = clock;
      this.spriteCache.set(key, sprite);
    }
    c.save(); c.translate(x, y); c.rotate(aim + Math.PI / 2);
    c.drawImage(sprite, -36, -40, 72, 80);
    c.restore();
  }

  private paintEnemy(x: number, y: number, kind: number, aim: number, flash: boolean, seed: number): void {
    const c = this.ctx;
    c.save(); c.translate(x, y);
    const pulse = Math.sin(this.clock * (kind === 1 ? 12 : 6) + seed);
    c.fillStyle = '#060d105c'; c.beginPath(); c.ellipse(2, kind === 3 ? 30 : 12, kind === 3 ? 48 : kind === 2 ? 25 : 17, kind === 3 ? 18 : 7, 0, 0, TAU); c.fill();
    if (kind === 3) {
      c.rotate(this.clock * 0.12);
      c.strokeStyle = '#bd737b70'; c.lineWidth = 2; this.circle(0, 0, 56 + pulse * 2); c.stroke();
      for (let i = 0; i < 6; i++) {
        c.save(); c.rotate(i / 6 * TAU);
        c.fillStyle = flash ? '#fff2dc' : '#7f4b5a'; c.strokeStyle = '#d49499';
        c.beginPath(); c.moveTo(-12, -30); c.lineTo(-9, -62); c.lineTo(3, -47); c.lineTo(17, -33); c.closePath(); c.fill(); c.stroke();
        c.restore();
      }
      c.fillStyle = flash ? '#fff3dc' : '#392e40'; this.circle(0, 0, 37); c.fill();
      c.strokeStyle = '#d98e97'; c.lineWidth = 3; this.circle(0, 0, 29); c.stroke();
      c.fillStyle = '#edb0a4'; c.beginPath(); c.moveTo(0, -24); c.lineTo(15, 2); c.lineTo(0, 24); c.lineTo(-15, 2); c.closePath(); c.fill();
      c.fillStyle = '#733c54'; this.circle(0, 0, 7); c.fill();
    } else if (kind === 4) {
      // Crimson seed pod: the forward throat also marks its firing direction.
      c.rotate(aim + Math.PI / 2);
      c.strokeStyle = flash ? '#fff6dc' : '#d5777f'; c.lineWidth = 1.4;
      c.fillStyle = flash ? '#fff6dc' : '#82414f';
      c.beginPath(); c.moveTo(-13, -10); c.lineTo(-25, -4); c.lineTo(-19, 4); c.lineTo(-23, 17); c.lineTo(-9, 15); c.lineTo(0, 23); c.lineTo(9, 15); c.lineTo(23, 17); c.lineTo(19, 4); c.lineTo(25, -4); c.lineTo(13, -10); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = flash ? '#fff6dc' : '#462b3a'; c.beginPath(); c.ellipse(0, 3, 14, 16 + pulse, 0, 0, TAU); c.fill();
      c.fillStyle = flash ? '#fff6dc' : '#c76670';
      c.beginPath(); c.moveTo(-9, -4); c.lineTo(-7, -23); c.lineTo(0, -28); c.lineTo(7, -23); c.lineTo(9, -4); c.lineTo(0, 11); c.closePath(); c.fill();
      c.fillStyle = '#411d2d'; c.beginPath(); c.ellipse(0, -21, 5, 4, 0, 0, TAU); c.fill();
      c.fillStyle = '#ff6b74'; this.circle(0, -22, 2.5); c.fill();
      c.strokeStyle = '#e7938f'; c.beginPath(); c.moveTo(-11, 5); c.lineTo(-5, 11); c.moveTo(11, 5); c.lineTo(5, 11); c.stroke();
      c.fillStyle = '#f9b09e'; this.circle(0, 1, 3); c.fill();
    } else if (kind === 1) {
      c.rotate(aim + Math.PI / 2);
      c.fillStyle = flash ? '#fff5dc' : '#9e83bb';
      c.strokeStyle = flash ? '#fff' : '#d2b6e5'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, -16); c.quadraticCurveTo(17, -2, 11, 12); c.lineTo(4, 8 + pulse * 2); c.lineTo(0, 14); c.lineTo(-5, 8 - pulse * 2); c.lineTo(-11, 12); c.quadraticCurveTo(-17, -2, 0, -16); c.fill(); c.stroke();
      c.fillStyle = '#342939'; c.fillRect(-6, -4, 12, 5); c.fillStyle = '#f8d6e9'; c.fillRect(-4, -3, 3, 2); c.fillRect(2, -3, 3, 2);
    } else if (kind === 2) {
      c.rotate(aim + Math.PI / 2);
      c.fillStyle = flash ? '#fff6dc' : '#8e7b58'; c.strokeStyle = '#c3b58d'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-17, -19); c.lineTo(9, -23); c.lineTo(24, -7); c.lineTo(20, 19); c.lineTo(-9, 23); c.lineTo(-25, 5); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#4f5044'; c.beginPath(); c.moveTo(-12, -12); c.lineTo(8, -15); c.lineTo(15, 3); c.lineTo(2, 16); c.lineTo(-16, 6); c.closePath(); c.fill();
      c.strokeStyle = '#d4c492'; c.beginPath(); c.moveTo(-12, -12); c.lineTo(-3, 1); c.lineTo(2, 16); c.moveTo(-3, 1); c.lineTo(15, 3); c.stroke();
      c.fillStyle = '#f2c97d'; c.fillRect(-7, -7, 5, 4); c.fillRect(4, -7, 5, 4);
    } else {
      c.rotate(aim + Math.PI / 2);
      c.strokeStyle = flash ? '#fff6dc' : '#a47172'; c.lineWidth = 2;
      for (const side of [-1, 1]) {
        c.beginPath(); c.moveTo(side * 9, -5); c.lineTo(side * 18, -11 - pulse * 2); c.lineTo(side * 21, -3); c.moveTo(side * 10, 5); c.lineTo(side * 19, 8 + pulse * 2); c.lineTo(side * 19, 16); c.stroke();
      }
      c.fillStyle = flash ? '#fff6dc' : '#9c6265';
      c.beginPath(); c.moveTo(0, -17); c.quadraticCurveTo(18, -12, 13, 7); c.lineTo(0, 16); c.lineTo(-13, 7); c.quadraticCurveTo(-18, -12, 0, -17); c.fill();
      c.fillStyle = flash ? '#fff' : '#c88e88'; c.beginPath(); c.moveTo(0, -14); c.lineTo(3, 3); c.lineTo(0, 12); c.lineTo(-3, 3); c.closePath(); c.fill();
      c.fillStyle = '#281f2b'; c.fillRect(-9, -5, 6, 5); c.fillRect(3, -5, 6, 5);
      c.fillStyle = '#f2beaa'; c.fillRect(-7, -4, 3, 2); c.fillRect(4, -4, 3, 2);
    }
    c.restore();
  }

  private effect(fx: Effect): void {
    const c = this.ctx, t = 1 - fx.life / fx.max;
    c.save(); c.globalAlpha = Math.max(0, 1 - t); c.strokeStyle = fx.color; c.fillStyle = fx.color;
    if (fx.type === 'text') {
      c.font = `600 ${fx.size}px "Segoe UI", sans-serif`; c.textAlign = 'center';
      c.fillText(fx.text ?? '', fx.x, fx.y - t * 32);
    } else if (fx.type === 'ring') {
      c.lineWidth = 2 * (1 - t); this.circle(fx.x, fx.y, 8 + fx.size * t); c.stroke();
    } else if (fx.type === 'burst') {
      for (let i = 0; i < 7; i++) {
        const angle = i / 7 * TAU + fx.x;
        const distance = fx.size * (0.5 + t * 1.7);
        c.beginPath(); c.arc(fx.x + Math.cos(angle) * distance, fx.y + Math.sin(angle) * distance, 2 * (1 - t) + 0.5, 0, TAU); c.fill();
      }
    } else if (fx.type === 'line') {
      c.lineWidth = 2;
      const dx = (fx.x2 ?? fx.x) - fx.x, dy = (fx.y2 ?? fx.y) - fx.y;
      c.beginPath(); c.moveTo(fx.x, fx.y);
      for (let i = 1; i < 6; i++) {
        const jitter = Math.sin(i * 79 + fx.x) * 17;
        c.lineTo(fx.x + dx * i / 6 + Math.cos(Math.atan2(dy, dx) + Math.PI / 2) * jitter, fx.y + dy * i / 6 + Math.sin(Math.atan2(dy, dx) + Math.PI / 2) * jitter);
      }
      c.lineTo(fx.x2!, fx.y2!); c.stroke();
      c.globalAlpha *= 0.2; c.lineWidth = 9; c.stroke();
    } else if (fx.type === 'trail') {
      c.globalAlpha *= 0.15; this.circle(fx.x, fx.y, fx.size * (1 - t)); c.fill();
    } else if (fx.type === 'warning') {
      c.globalAlpha = 0.12 + t * 0.22;
      this.circle(fx.x, fx.y, fx.size * t); c.fill();
      c.globalAlpha = 0.6; c.lineWidth = 1; this.circle(fx.x, fx.y, fx.size); c.stroke();
    }
    c.restore();
  }

  private attractScene(): void {
    const c = this.ctx;
    c.save();
    c.strokeStyle = '#efc78620'; c.lineWidth = 1;
    this.circle(0, 0, 220); c.stroke();
    c.setLineDash([2, 13]); this.circle(0, 0, 310); c.stroke(); c.setLineDash([]);
    for (let i = 0; i < 11; i++) {
      const angle = i / 11 * TAU + this.clock * 0.015;
      const radius = 230 + noise(i, 5) * 100;
      this.enemy(Math.cos(angle) * radius, Math.sin(angle) * radius, i % 4 === 0 ? 2 : i % 3 === 0 ? 1 : 0, angle + Math.PI, false, i);
    }
    for (let i = 0; i < 3; i++) {
      const a = this.clock * 0.8 + i / 3 * TAU;
      c.fillStyle = '#99ddca'; c.save(); c.translate(Math.cos(a) * 83, Math.sin(a) * 83); c.rotate(a); c.fillRect(-2, -10, 4, 20); c.restore();
    }
    for (let i = 0; i < 24; i++) {
      const a = noise(i, 9) * TAU, r = noise(i, 21) * 350;
      c.globalAlpha = 0.3 + Math.sin(this.clock + i) * 0.2;
      c.fillStyle = i % 3 ? '#c1b687' : '#96e4cc'; this.circle(Math.cos(a) * r, Math.sin(a) * r - this.clock * 3 % 30, 1.5); c.fill();
    }
    c.restore();
  }

  private circle(x: number, y: number, radius: number): void {
    this.ctx.beginPath(); this.ctx.arc(x, y, Math.max(0, radius), 0, TAU);
  }
}
