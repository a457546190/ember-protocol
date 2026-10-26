import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const entry = process.argv[2] || pathToFileURL(resolve('EmberProtocol.html')).href;
await page.goto(`${entry}?debug`);
await page.getByRole('button', { name: '开始行动' }).tap();
await page.locator('#joystick:visible').waitFor();
await page.evaluate(() => {
  window.__touchEvents = [];
  for (const type of ['resize', 'blur', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(type, e => window.__touchEvents.push([type, e.target?.id, e.pointerId, performance.now()]));
});
const cdp = await context.newCDPSession(page);
const box = await page.locator('#joystick').boundingBox();
const center = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
const moved = { x: center.x + 45, y: center.y - 22, id: 1 };
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
await page.waitForTimeout(260);
const movement = await page.evaluate(() => ({ x: window.__ember.sim.world.x[0], y: window.__ember.sim.world.y[0] }));
if (movement.x < 25 || movement.y > -10) {
  console.log(await page.evaluate(() => ({ status: window.__ember.sim.status, events: window.__touchEvents, active: document.querySelector('#joystick').className })));
  throw new Error(`Analog movement failed: ${JSON.stringify(movement)}`);
}
const dashBox = await page.getByRole('button', { name: '闪避冲刺' }).boundingBox();
const dashTouch = { x: dashBox.x + dashBox.width / 2, y: dashBox.y + dashBox.height / 2, id: 2 };
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moved, dashTouch] });
await page.waitForTimeout(90);
const multitouchDash = await page.evaluate(() => window.__ember.sim.dashCooldown);
if (multitouchDash <= 2) {
  console.log(await page.evaluate(() => ({ events: window.__touchEvents, status: window.__ember.sim.status, cooldown: window.__ember.sim.dashCooldown })));
  console.log({ dashTouch, dashBox });
  throw new Error('Second-finger dash failed while holding the stick');
}
await page.screenshot({ path: 'test-results/17-mobile-joystick.png' });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [dashTouch] });
if (!await page.locator('#joystick').evaluate(el => el.classList.contains('active'))) {
  console.log(await page.evaluate(() => ({ events: window.__touchEvents, status: window.__ember.sim.status })));
  throw new Error('Releasing dash finger stopped the joystick');
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(300);
const stopped = await page.evaluate(() => Math.hypot(window.__ember.sim.world.vx[0], window.__ember.sim.world.vy[0]));
if (stopped !== 0) throw new Error('Movement stuck after releasing the stick');

await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...center, x: center.x - 36, y: center.y + 24 }] });
await page.waitForTimeout(80);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
await page.waitForTimeout(60);
if (await page.locator('#joystick').evaluate(el => el.classList.contains('active'))) throw new Error('Pointer cancel did not reset the stick');

await page.getByRole('button', { name: '暂停游戏' }).tap();
await page.getByRole('heading', { name: '喘息片刻。' }).waitFor();
if (await page.locator('#joystick').isVisible()) throw new Error('Stick is visible over pause modal');
await page.getByRole('button', { name: '继续行动' }).tap();
await page.locator('#joystick:visible').waitFor();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
await page.evaluate(() => { const s = window.__ember.sim; s.xp = s.xpRequired; s.checkLevel(); });
await page.getByRole('heading', { name: '余烬，正在觉醒。' }).waitFor();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
if (await page.locator('#joystick').isVisible()) throw new Error('Stick is visible over upgrade modal');
await page.getByRole('button', { name: /公转环刃/ }).tap();
await page.locator('#joystick:visible').waitFor();
await page.waitForTimeout(80);
if (await page.evaluate(() => Math.hypot(window.__ember.sim.world.vx[0], window.__ember.sim.world.vy[0])) !== 0) throw new Error('Old touch input survived an upgrade');

for (const viewport of [{ width: 844, height: 390 }, { width: 320, height: 568 }, { width: 430, height: 932 }]) {
  await page.setViewportSize(viewport); await page.waitForTimeout(100);
  for (const selector of ['#joystick', '#dash-button']) {
    const b = await page.locator(selector).boundingBox();
    if (!b || b.x < 0 || b.y < 0 || b.x + b.width > viewport.width || b.y + b.height > viewport.height) throw new Error(`${selector} outside ${JSON.stringify(viewport)}`);
  }
  if (viewport.width === 844) await page.screenshot({ path: 'test-results/18-mobile-landscape.png' });
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ entry, movement, multitouchDash, releaseStopsMovement: true, cancelResetsStick: true, upgradeClearsInput: true, pauseHidesStick: true, viewports: ['390x844', '844x390', '320x568', '430x932'], errors }, null, 2));
await browser.close();
