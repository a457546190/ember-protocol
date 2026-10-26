export class AudioEngine {
  muted = false;
  private context?: AudioContext;
  private master?: GainNode;
  private lastShot = 0;

  unlock(): void {
    this.context ??= new AudioContext();
    if (!this.master) {
      this.master = this.context.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.context.destination);
    }
    void this.context.resume();
  }

  play(kind: string): void {
    const ctx = this.context;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    if (kind === 'shot' && ctx.currentTime - this.lastShot < 0.075) return;
    if (kind === 'shot') this.lastShot = ctx.currentTime;
    const spec: Record<string, [number, number, number, OscillatorType]> = {
      shot: [530, 140, 0.065, 'triangle'], enemyShot: [240, 100, 0.11, 'triangle'], hit: [120, 40, 0.07, 'sine'],
      pickup: [860, 1150, 0.04, 'sine'], hurt: [150, 45, 0.22, 'sawtooth'],
      dash: [200, 900, 0.13, 'triangle'], level: [520, 1040, 0.5, 'sine'],
      arc: [900, 110, 0.14, 'sawtooth'], boss: [85, 38, 1, 'sawtooth'],
      select: [640, 960, 0.17, 'sine'], win: [440, 1320, 0.9, 'triangle'],
    };
    const [from, to, duration, type] = spec[kind] ?? spec.hit;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    gain.gain.setValueAtTime(kind === 'shot' ? 0.25 : 0.45, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }
}
