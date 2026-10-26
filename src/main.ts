import './style.css';
import { AudioEngine } from './audio';
import { Renderer } from './renderer';
import { Simulation, RUN_DURATION, type Status } from './simulation';
import { joystickVector } from './touch';

const $ = <T extends Element = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const app = $('#app');
const audio = new AudioEngine();
const renderer = new Renderer($('#game'));
let sim = new Simulation();
let lastStatus: Status | '' = '';
let help = false;
let best = 0;
let bestKills = 0;
let fps = 60;
let showPerf = new URLSearchParams(location.search).has('debug');
let toastTimer = 0;
let storedResult = false;
try {
  best = Number(localStorage.getItem('ember-best') || 0);
  bestKills = Number(localStorage.getItem('ember-kills') || 0);
  audio.muted = localStorage.getItem('ember-muted') === 'true';
} catch { /* Storage is optional (e.g. private browser modes). */ }

const keys = new Set<string>();
let dashQueued = false;
let pointer: { id: number; x: number; y: number; target: HTMLElement } | null = null;
let touchX = 0, touchY = 0;
const coarsePointer = window.matchMedia('(pointer: coarse)');
let touchMode = coarsePointer.matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle('touch-controls', touchMode);
let lastBossSpawned = false;
let lastRangedIntroduced = false;

const icons: Record<string, string> = {
  spark: '<path d="m13 2-8 12h7l-1 8 8-12h-7z"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14m8-14v14"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  cross: '<path d="m6 6 12 12M6 18 18 6"/>',
  blade: '<path d="m5 19 3-7L19 3l-3 12-7 3zM8 12l8 3M4 16l4 4"/>',
  bolt: '<path d="m14 2-9 12h7l-2 8 9-12h-7z"/>',
  gun: '<path d="M3 8h17v6H9l-2 6H3l2-6H3zM15 8v6M6 5h7"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  skull: '<path d="M8 18H5v-6a7 7 0 0 1 14 0v6h-3v4H8zM9 18h6M10 18v4m4-4v4"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/>',
  move: '<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4m10-8 4 4-4 4"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const brand = `<div class="brand-mark">${icon('spark')}</div><div class="brand-word">余烬协议<span>EMBER PROTOCOL</span></div>`;

app.innerHTML = `
  <div id="menu-chrome"><header class="menu-header"><div class="brand">${brand}</div><div class="build-tag"><i></i> FIELD TEST <span>/</span> VOL. 01</div></header><footer class="menu-footer"><span>一束余烬，也能照亮荒野。</span><span>独立生存实验 <b>·</b> ECS POWERED</span></footer></div>
  <div id="hud" hidden>
    <div class="xp-track"><div id="xp-fill"></div></div>
    <header class="game-header">
      <div class="vitals"><div class="player-label"><span class="live-dot"></span>游侠 · 07 <span id="level">LV. 01</span></div><div class="health-row">${icon('heart')}<div class="health-track"><div id="health-fill"></div></div><span id="health-number">100 / 100</span></div><span class="xp-label" id="xp-label">余烬 0 / 15</span></div>
      <div class="run-clock"><div class="clock-caption">生 存 时 间</div><div id="timer">00:00</div><div class="wave-label"><i></i><span id="wave">第 01 波</span><span class="divider">/</span><span>03:00 撤离</span></div></div>
      <div class="header-right"><div class="kill-count">${icon('skull')}<strong id="kills">0</strong><span>击 杀</span></div><div class="header-buttons"><button class="icon-button" data-action="mute" aria-label="切换音效">${icon(audio.muted ? 'muted' : 'sound')}</button><button class="icon-button" data-action="pause" aria-label="暂停游戏">${icon('pause')}</button></div></div>
    </header>
    <div id="boss-bar" hidden><div><span>裂 隙 领 主</span><span id="boss-hp"></span></div><div class="boss-track"><div id="boss-fill"></div></div></div>
    <div class="bottom-hud"><div class="loadout"><span class="overline">武 器 协 议</span><div class="weapon-slots"><div class="weapon-slot active amber" id="weapon-gun">${icon('gun')}<span id="gun-level">01</span></div><div class="weapon-slot" id="weapon-blades">${icon('blade')}<span id="blades-level">—</span></div><div class="weapon-slot" id="weapon-arc">${icon('bolt')}<span id="arc-level">—</span></div><div class="loadout-copy"><strong>脉冲步枪</strong><span>自动锁定 · 自由移动</span></div></div></div><div class="dash-block"><button id="dash-button" aria-label="闪避冲刺">${icon('bolt')}<span id="dash-text">闪避就绪</span><kbd>SPACE</kbd><div id="dash-fill"></div></button><span class="dash-caption">短暂无敌 · 2.5 秒充能</span></div></div>
    <div id="first-tip">${icon('move')} WASD 移动 <span>·</span> 自动攻击 <span>·</span> 空格闪避</div>
  </div>
  <div id="overlay"></div>
  <div id="toast" role="status"></div>
  <div id="performance" hidden></div>
  <div id="joystick" role="group" aria-label="移动摇杆" hidden><span class="joystick-axis"></span><div class="joystick-knob">${icon('move')}</div><span class="joystick-label">移动</span></div>
`;

function menuMarkup(): string {
  return `<main class="landing"><div class="edition"><span>荒野生存 / ROGUELITE</span><span class="edition-line"></span><span>001</span></div><p class="eyebrow">THE LAST LIGHT IN THE WILDS</p><h1>余烬<span>协议<span class="title-dot">.</span></span></h1><p class="landing-description">怪潮将至，火种未熄。<br>收集余烬，进化武装，在荒野中撑过最后三分钟。</p><div class="landing-actions"><button class="primary-button" data-action="start">开始行动 ${icon('arrow')}</button><button class="text-button" data-action="help">行动指南 <span>↗</span></button></div><div class="landing-facts"><div><strong>03:00</strong><span>极限生存</span></div><div><strong>3 <small>种</small></strong><span>武器构筑</span></div><div><strong>∞</strong><span>进化可能</span></div></div></main><aside class="hero-annotation"><span class="annotation-cross">+</span><span>游侠 / RANGER–07</span><strong>最后的火种携带者</strong><div class="annotation-rule"></div><span class="annotation-small">PULSE RIFLE · EMBER CORE</span></aside><div class="landing-record"><span>个人最佳</span><strong>${clock(best)}</strong><span>${bestKills} 击杀</span></div><div class="menu-tools"><button class="icon-button" data-action="mute" aria-label="切换音效">${icon(audio.muted ? 'muted' : 'sound')}</button><button class="icon-button" data-action="fullscreen" aria-label="切换全屏">${icon('expand')}</button></div>`;
}

function helpMarkup(): string {
  return `<div class="modal-backdrop"><section class="guide panel"><div class="panel-top"><span class="eyebrow">FIELD MANUAL / 01</span><button class="icon-button" data-action="close-help" aria-label="关闭指南">${icon('cross')}</button></div><h2>活下去，<em>然后变强。</em></h2><p class="panel-intro">坚持三分钟，并击败 02:30 到来的裂隙领主。</p><div class="guide-row"><span class="guide-icon">${icon('move')}</span><div><strong>保持移动</strong><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或方向键移动，武器自动瞄准。<br>触屏设备：拖动画面移动。</p></div></div><div class="guide-row"><span class="guide-icon">${icon('bolt')}</span><div><strong>穿过包围</strong><p><kbd>SPACE</kbd> 沿移动方向闪避，期间短暂无敌。<br>冷却 2.5 秒，危险时给自己留条退路。</p></div></div><div class="guide-row"><span class="guide-icon">${icon('spark')}</span><div><strong>让余烬成为火焰</strong><p>拾取敌人掉落的青色晶体，升级时三选一。<br>环刃护身，电弧清场，弹幕压制。</p></div></div><div class="guide-shortcuts"><span><kbd>ESC</kbd> / <kbd>P</kbd> 暂停</span><span><kbd>M</kbd> 音效</span><span><kbd>F3</kbd> 性能面板</span></div><button class="primary-button full" data-action="close-help">准备就绪 ${icon('arrow')}</button></section></div>`;
}

function upgradeMarkup(): string {
  return `<div class="modal-backdrop upgrade-backdrop"><section class="upgrade-panel"><div class="level-emblem">${icon('spark')}</div><div class="eyebrow">EVOLUTION AVAILABLE / LEVEL ${String(sim.level).padStart(2, '0')}</div><h2>余烬，<em>正在觉醒。</em></h2><p class="panel-intro">选择一项强化，塑造你的生存方式。</p><div class="upgrade-cards">${sim.choices.map((choice, i) => `<button class="upgrade-card" data-choice="${i}" style="--card-color:${choice.color}"><div class="card-top"><span>${choice.category}</span><kbd>${i + 1}</kbd></div><div class="upgrade-glyph">${choice.icon}</div><div class="card-level">${sim.upgrades[choice.id] ? `LV. ${sim.upgrades[choice.id]} → ${sim.upgrades[choice.id] + 1}` : 'NEW PROTOCOL'}</div><h3>${choice.name}</h3><p>${choice.description}</p><div class="card-footer">选择强化 ${icon('arrow')}</div></button>`).join('')}</div><div class="upgrade-footnote"><span class="live-dot"></span>战斗已暂停 <span>·</span> 按数字键 1 / 2 / 3 快速选择</div></section></div>`;
}

function renderOverlay(): void {
  const menu = sim.status === 'menu';
  $('#menu-chrome').toggleAttribute('hidden', !menu);
  $('#hud').toggleAttribute('hidden', menu);
  syncTouchControls();
  const overlay = $('#overlay');
  if (help) { overlay.innerHTML = helpMarkup(); return; }
  if (menu) overlay.innerHTML = menuMarkup();
  else if (sim.status === 'upgrading') overlay.innerHTML = upgradeMarkup();
  else if (sim.status === 'paused') overlay.innerHTML = `<div class="modal-backdrop"><section class="pause-panel panel"><div class="pause-symbol">Ⅱ</div><span class="eyebrow">SIGNAL ON HOLD</span><h2>喘息片刻。</h2><p class="panel-intro">荒野正在等你归来。</p><button class="primary-button full" data-action="resume">继续行动 ${icon('arrow')}</button><button class="secondary-button full" data-action="help">行动指南</button><button class="text-button" data-action="menu">返回营地</button><p class="small-note">按 ESC / P 继续</p></section></div>`;
  else if (sim.status === 'won' || sim.status === 'lost') {
    const won = sim.status === 'won';
    if (!storedResult) {
      best = Math.max(best, sim.time); bestKills = Math.max(bestKills, sim.kills); storedResult = true;
      try { localStorage.setItem('ember-best', `${best}`); localStorage.setItem('ember-kills', `${bestKills}`); } catch { /* Optional. */ }
    }
    overlay.innerHTML = `<div class="modal-backdrop"><section class="result-panel panel"><div class="result-emblem ${won ? 'victory' : ''}">${icon(won ? 'spark' : 'skull')}</div><span class="eyebrow">${won ? 'PROTOCOL COMPLETE' : 'SIGNAL LOST / RUN ENDED'}</span><h2>${won ? '火种，生生不息。' : '余烬，尚未熄灭。'}</h2><p class="panel-intro">${won ? '裂隙已关闭。游侠，欢迎回到营地。' : '每一次倒下，都是下一次出发的序章。'}</p><div class="result-stats"><div><span>生存时间</span><strong>${clock(sim.time)}</strong></div><div><span>消灭敌人</span><strong>${sim.kills}</strong></div><div><span>进化等级</span><strong>${String(sim.level).padStart(2, '0')}</strong></div></div><div class="result-detail"><span>总伤害 <b>${Math.round(sim.damageDealt).toLocaleString()}</b></span><span>收集余烬 <b>${sim.xpTotal}</b></span></div><button class="primary-button full" data-action="restart">再次出发 ${icon('arrow')}</button><button class="text-button" data-action="menu">返回营地</button><p class="small-note">按 R 再次出发</p></section></div>`;
  } else overlay.innerHTML = '';
  if (sim.status === 'upgrading') setTimeout(() => $('.upgrade-card')?.focus(), 50);
}

function reset(start: boolean): void {
  sim = new Simulation();
  storedResult = false; lastBossSpawned = false; lastRangedIntroduced = false; help = false;
  window.clearTimeout(toastTimer); $('#toast').classList.remove('visible');
  clearInput();
  if (start) { audio.unlock(); sim.start(); }
  lastStatus = ''; accumulator = 0;
  renderOverlay(); updateHUD();
}

function clearInput(): void {
  keys.clear(); touchX = touchY = 0; dashQueued = false;
  const active = pointer; pointer = null;
  if (active?.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
  $('#joystick').classList.remove('active');
  $('.joystick-knob').style.transform = 'translate(0px, 0px)';
  syncTouchControls();
}

function syncTouchControls(): void {
  $('#joystick').hidden = !touchMode || sim.status !== 'playing';
}

function pause(): void {
  if (sim.status === 'playing') { sim.status = 'paused'; clearInput(); }
  else if (sim.status === 'paused' && !help) { sim.status = 'playing'; audio.unlock(); }
}

function notify(message: string): void {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => $('#toast').classList.remove('visible'), 3400);
}

function mute(): void {
  audio.muted = !audio.muted;
  try { localStorage.setItem('ember-muted', `${audio.muted}`); } catch { /* Optional. */ }
  document.querySelectorAll('[data-action="mute"]').forEach(el => { el.innerHTML = icon(audio.muted ? 'muted' : 'sound'); el.setAttribute('aria-label', audio.muted ? '开启音效' : '关闭音效'); });
}

app.addEventListener('click', async event => {
  const target = (event.target as Element).closest<HTMLElement>('[data-action], [data-choice]');
  if (!target) return;
  audio.unlock();
  if (target.dataset.choice !== undefined) { sim.choose(Number(target.dataset.choice)); clearInput(); lastStatus = ''; return; }
  switch (target.dataset.action) {
    case 'start': case 'restart': reset(true); break;
    case 'menu': reset(false); break;
    case 'pause': case 'resume': pause(); break;
    case 'mute': mute(); break;
    case 'help': help = true; renderOverlay(); break;
    case 'close-help': help = false; renderOverlay(); break;
    case 'fullscreen':
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
      catch { notify('当前窗口暂不支持全屏，可以扩大浏览器窗口游玩。'); }
      break;
  }
});

document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'f3'].includes(key)) event.preventDefault();
  if (event.repeat) return;
  keys.add(key);
  if (key === 'm') mute();
  if (key === 'f3') showPerf = !showPerf;
  if (key === 'escape' || key === 'p') {
    if (help) { help = false; renderOverlay(); } else pause();
  }
  if (key === ' ' && sim.status === 'playing') dashQueued = true;
  if (sim.status === 'upgrading' && ['1', '2', '3'].includes(key)) { sim.choose(Number(key) - 1); clearInput(); lastStatus = ''; }
  if (key === 'r' && (sim.status === 'won' || sim.status === 'lost')) reset(true);
});
document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { if (sim.status === 'playing') pause(); clearInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && sim.status === 'playing') pause(); });
window.addEventListener('resize', () => { renderer.resize(); clearInput(); });
window.visualViewport?.addEventListener('resize', () => renderer.resize());
coarsePointer.addEventListener('change', () => {
  touchMode = coarsePointer.matches || navigator.maxTouchPoints > 0;
  document.body.classList.toggle('touch-controls', touchMode);
  clearInput();
});

const canvas = $('#game');
const joystick = $('#joystick');
function movePointer(e: PointerEvent): void {
  if (!pointer || e.pointerId !== pointer.id) return;
  const vector = joystickVector(e.clientX - pointer.x, e.clientY - pointer.y);
  touchX = vector.x; touchY = vector.y;
  $('.joystick-knob').style.transform = `translate(${touchX * 35}px, ${touchY * 35}px)`;
}
function pressPointer(event: Event): void {
  const e = event as PointerEvent;
  if (e.pointerType === 'mouse' || sim.status !== 'playing' || pointer) return;
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  const bounds = joystick.getBoundingClientRect();
  const onJoystick = target === joystick;
  pointer = { id: e.pointerId, x: onJoystick ? bounds.x + bounds.width / 2 : e.clientX, y: onJoystick ? bounds.y + bounds.height / 2 : e.clientY, target };
  target.setPointerCapture(e.pointerId);
  joystick.classList.add('active');
  movePointer(e);
}
const releasePointer = (event: Event) => {
  if ((event as PointerEvent).pointerId !== pointer?.id) return;
  const active = pointer; pointer = null; touchX = touchY = 0;
  if (active.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
  joystick.classList.remove('active');
  $('.joystick-knob').style.transform = 'translate(0px, 0px)';
};
for (const surface of [canvas, joystick]) {
  surface.addEventListener('pointerdown', pressPointer);
  surface.addEventListener('pointermove', event => movePointer(event as PointerEvent));
  surface.addEventListener('pointerup', releasePointer);
  surface.addEventListener('pointercancel', releasePointer);
  surface.addEventListener('lostpointercapture', releasePointer);
}
$('#dash-button').addEventListener('pointerdown', event => { event.preventDefault(); if (sim.status === 'playing') { dashQueued = true; audio.unlock(); } });

function updateHUD(): void {
  $('#level').textContent = `LV. ${String(sim.level).padStart(2, '0')}`;
  $('#health-number').textContent = `${Math.max(0, Math.ceil(sim.hp))} / ${sim.maxHp}`;
  $('#health-fill').style.width = `${Math.max(0, sim.hp / sim.maxHp * 100)}%`;
  $('#health-fill').classList.toggle('low', sim.hp / sim.maxHp < 0.3);
  $('#xp-fill').style.width = `${Math.min(100, sim.xp / sim.xpRequired * 100)}%`;
  $('#xp-label').textContent = `余烬 ${sim.xp} / ${sim.xpRequired}`;
  $('#timer').textContent = clock(sim.time);
  $('#wave').textContent = sim.bossSpawned ? (sim.bossDefeated ? '裂隙已关闭' : '领主挑战') : `第 ${String(sim.wave).padStart(2, '0')} 波`;
  $('.wave-label>span:last-child').textContent = sim.time >= RUN_DURATION && !sim.bossDefeated ? '击败领主后撤离' : '03:00 撤离';
  $('#kills').textContent = String(sim.kills);
  $('#gun-level').textContent = String(1 + sim.upgrades.power + sim.upgrades.haste + sim.upgrades.multishot).padStart(2, '0');
  $('#blades-level').textContent = sim.upgrades.blades ? String(sim.upgrades.blades).padStart(2, '0') : '—';
  $('#arc-level').textContent = sim.upgrades.arc ? String(sim.upgrades.arc).padStart(2, '0') : '—';
  $('#weapon-blades').classList.toggle('active', sim.upgrades.blades > 0);
  $('#weapon-arc').classList.toggle('active', sim.upgrades.arc > 0);
  $('#dash-text').textContent = sim.dashCooldown > 0 ? `${sim.dashCooldown.toFixed(1)}s` : '闪避就绪';
  $('#dash-button').classList.toggle('charging', sim.dashCooldown > 0);
  $('#dash-fill').style.width = `${(1 - sim.dashCooldown / 2.5) * 100}%`;
  $('#first-tip').hidden = sim.time > 12 || sim.status !== 'playing';
  if (touchMode) $('#first-tip').innerHTML = '左手摇杆移动 <span>·</span> 右手点击闪避';
  $('#boss-bar').hidden = sim.bossId < 0;
  if (sim.bossId >= 0) {
    const w = sim.world;
    $('#boss-fill').style.width = `${Math.max(0, w.hp[sim.bossId] / w.maxHp[sim.bossId] * 100)}%`;
    $('#boss-hp').textContent = `${Math.max(0, Math.ceil(w.hp[sim.bossId]))} / ${w.maxHp[sim.bossId]}`;
  }
  if (sim.rangedIntroduced && !lastRangedIntroduced) { notify('警告 · 赤蕊喷射者出现，看到红色瞄准线时保持移动。'); lastRangedIntroduced = true; }
  if (sim.bossSpawned && !lastBossSpawned) { notify('警告 · 裂隙领主已降临，注意躲避红色环形弹幕。'); lastBossSpawned = true; }
  $('#performance').hidden = !showPerf || sim.status !== 'playing';
  if (showPerf) $('#performance').textContent = `${Math.round(fps)} FPS\n${sim.world.dense.length} ENTITIES\n${sim.enemies} HOSTILES\n${sim.collisionChecks} COLLISION CHECKS\nSIM 60 Hz · SoA ECS`;
}

let previous = performance.now(), accumulator = 0, hudTimer = 0;
function frame(now: number): void {
  const elapsed = Math.min(0.1, (now - previous) / 1000); previous = now;
  fps += ((1 / Math.max(0.001, elapsed)) - fps) * 0.04;
  if (sim.status === 'playing') {
    accumulator += elapsed;
    while (accumulator >= 1 / 60) {
      const x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) + touchX;
      const y = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) + touchY;
      sim.update(1 / 60, { x, y, dash: dashQueued });
      dashQueued = false; accumulator -= 1 / 60;
      if (sim.status !== 'playing') { accumulator = 0; clearInput(); break; }
    }
  } else accumulator = 0;
  for (const sound of sim.sounds) audio.play(sound);
  sim.sounds.length = 0;
  renderer.draw(sim, elapsed);
  if (lastStatus !== sim.status) { lastStatus = sim.status; renderOverlay(); hudTimer = 1; }
  hudTimer += elapsed;
  if (hudTimer > 0.08) { updateHUD(); hudTimer = 0; }
  requestAnimationFrame(frame);
}
renderOverlay();
requestAnimationFrame(frame);

// A query-gated inspection bridge supports reproducible browser QA without affecting normal play.
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { __ember: {
    get sim() { return sim; },
    start: () => reset(true),
    step: (seconds: number, input = { x: 0, y: 0, dash: false }) => {
      for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1 / 60, input);
      updateHUD();
    },
    duration: RUN_DURATION,
  } });
}
