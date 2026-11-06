import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3100/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });

const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url);
await page.waitForSelector('.lib-table', { timeout: 20000 });
await page.waitForTimeout(400);

const library = await page.evaluate(() => {
  const screen = document.querySelector('.screen')?.getBoundingClientRect();
  const titles = [...document.querySelectorAll('.lib-title')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent?.replace(/\s+/g, ' ').trim(),
      y: Math.round(r.y),
      h: Math.round(r.height),
      visible: Boolean(screen) && r.top >= screen.top && r.bottom <= screen.bottom,
    };
  });
  return { titles, screen: screen && { top: screen.top, bottom: screen.bottom } };
});
await page.screenshot({ path: 'shot-zombie-library.png' });

const zombieRow = page.locator('.lib-row:not(.lib-head)').filter({ hasText: /КРОВЬ ЗОМБИ/i });
await zombieRow.locator('.lib-start').click();
await page.waitForSelector('.bookload', { timeout: 5000 });
await page.waitForTimeout(500);
await page.screenshot({ path: 'shot-zombie-loading.png' });
const loading = await page.evaluate(() => ({
  title: document.querySelector('.bookload-title, .bookload-line .bookload-title')?.textContent,
  bar: document.querySelector('.bookload-bar')?.textContent,
  lines: [...document.querySelectorAll('.bookload-line')].map((el) => el.textContent),
}));

await page.waitForSelector('.title-line', { timeout: 20000 });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shot-zombie-rules.png' });
const start = await page.evaluate(() => ({
  heading: document.querySelector('.title-line > span:first-child')?.textContent,
  text: document.querySelector('.scene-text')?.textContent?.slice(0, 120),
  choices: [...document.querySelectorAll('.choice')].map((el) => el.textContent?.trim()),
  parseReport: document.querySelector('.parse-report')?.textContent ?? null,
  inventory: document.querySelector('.title-line .inv')?.textContent ?? null,
}));

// rules -> prolog -> 1 (линейные переходы)
for (let i = 0; i < 2; i += 1) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}
const scene1 = await page.evaluate(() => ({
  heading: document.querySelector('.title-line > span:first-child')?.textContent,
  choices: [...document.querySelectorAll('.choice')].map((el) => el.textContent?.trim()),
  text: document.querySelector('.scene-text')?.textContent?.slice(0, 100),
}));
await page.screenshot({ path: 'shot-zombie-scene1.png' });

const mobile = await browser.newPage({ viewport: { width: 420, height: 900 } });
await mobile.goto(url);
await mobile.waitForSelector('.lib-table', { timeout: 20000 });
await mobile.waitForTimeout(400);
const mobileLibrary = await mobile.evaluate(() => {
  const screen = document.querySelector('.screen')?.getBoundingClientRect();
  return [...document.querySelectorAll('.lib-title')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent?.replace(/\s+/g, ' ').trim(),
      y: Math.round(r.y),
      visible: Boolean(screen) && r.top >= screen.top && r.bottom <= screen.bottom,
    };
  });
});
await mobile.screenshot({ path: 'shot-zombie-library-mobile.png' });

console.log(JSON.stringify({ library, loading, start, scene1, mobileLibrary, errors }, null, 2));
await browser.close();
