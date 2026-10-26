import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const url = pathToFileURL(resolve('EmberProtocol.html')).href;
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desktop.on('pageerror', error => errors.push(error.message));
await desktop.route('http://**/*', route => route.abort());
await desktop.route('https://**/*', route => route.abort());
await desktop.goto(url);
await desktop.locator('h1').waitFor();
await desktop.waitForTimeout(400);
if (await desktop.evaluate(() => '__ember' in window)) throw new Error('Debug bridge leaked into the normal entry');
await desktop.screenshot({ path: 'test-results/10-offline-menu.png' });
await desktop.getByRole('button', { name: '开始行动' }).click();
await desktop.keyboard.down('d'); await desktop.waitForTimeout(300); await desktop.keyboard.up('d');
await desktop.keyboard.press('Escape');
await desktop.getByRole('heading', { name: '喘息片刻。' }).waitFor();

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mobile = await mobileContext.newPage();
mobile.on('pageerror', error => errors.push(error.message));
await mobile.goto(`${url}?debug`);
await mobile.getByRole('button', { name: '开始行动' }).tap();
const cdp = await mobileContext.newCDPSession(mobile);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 550 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y: 530 }] });
await mobile.waitForTimeout(400);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const touchMovement = await mobile.evaluate(() => ({ x: window.__ember.sim.world.x[0], y: window.__ember.sim.world.y[0] }));
if (touchMovement.x < 35) throw new Error(`Touch movement failed: ${JSON.stringify(touchMovement)}`);
await mobile.getByRole('button', { name: '闪避冲刺' }).tap();
await mobile.waitForTimeout(100);
const dash = await mobile.evaluate(() => window.__ember.sim.dashCooldown);
if (dash <= 0) throw new Error('Touch dash failed');
await mobile.screenshot({ path: 'test-results/11-touch-game.png' });
await mobile.evaluate(() => { const s = window.__ember.sim; s.xp = s.xpRequired; s.checkLevel(); });
await mobile.getByRole('heading', { name: '余烬，正在觉醒。' }).waitFor();
await mobile.waitForTimeout(300);
await mobile.screenshot({ path: 'test-results/12-touch-upgrade.png' });
await mobile.locator('.upgrade-card').first().tap();
await mobile.getByRole('button', { name: '暂停游戏' }).tap();
await mobile.getByRole('button', { name: '返回营地' }).tap();
await mobile.setViewportSize({ width: 740, height: 360 });
await mobile.waitForTimeout(300);
await mobile.screenshot({ path: 'test-results/13-landscape-menu.png' });
const startBox = await mobile.getByRole('button', { name: '开始行动' }).boundingBox();
if (!startBox || startBox.y < 0 || startBox.y + startBox.height > 360) throw new Error('Landscape start button outside viewport');

const stress = await browser.newPage({ viewport: { width: 1440, height: 900 } });
stress.on('pageerror', error => errors.push(error.message));
await stress.goto(`${url}?debug`);
const performance = await stress.evaluate(async () => {
  const s = window.__ember.sim;
  s.start(); s.invulnerable = 100; s.level = 99; s.time = 120;
  Object.assign(s.upgrades, { blades: 5, arc: 5, power: 5, haste: 5, multishot: 4 });
  for (let i = 0; i < 460; i++) { const id = s.spawnEnemy(i % 3, 120 + i % 24 * 20); s.world.hp[id] = s.world.maxHp[id] = 100000; }
  const samples = [];
  let previous = performance.now();
  await new Promise(resolve => {
    const tick = now => {
      samples.push(now - previous); previous = now;
      if (samples.length < 150) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  samples.splice(0, 10);
  samples.sort((a, b) => a - b);
  return { entities: s.world.dense.length, enemies: s.enemies, averageFrameMs: +(samples.reduce((a,b) => a+b,0) / samples.length).toFixed(2), p95FrameMs: +samples[Math.floor(samples.length * 0.95)].toFixed(2), checks: s.collisionChecks };
});
await stress.screenshot({ path: 'test-results/14-stress.png' });
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ offlineFile: true, externalNetworkBlocked: true, touchMovement, touchDashCooldown: dash, landscapeStartVisible: true, stress: performance, errors }, null, 2));
await browser.close();
