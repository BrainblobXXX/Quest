import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3100/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });

const errors = [];
async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${viewport.width}x${viewport.height}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  return page;
}

const powerState = () =>
  (() => {
    const btn = document.querySelector('.power-btn');
    const led = document.querySelector('.led.pwr');
    return {
      disabled: btn?.disabled,
      label: btn?.getAttribute('title'),
      opacity: getComputedStyle(btn).opacity,
      ledBg: getComputedStyle(led).backgroundColor,
      ledShadow: getComputedStyle(led).boxShadow,
      confirm: Boolean(document.querySelector('.confirm-overlay')),
    };
  })();

const page = await newPage({ width: 1280, height: 900 });
await page.goto(url);
await page.waitForSelector('.lib-table', { timeout: 20000 });
await page.waitForTimeout(300);

const libraryPower = await page.evaluate(powerState);
await page.screenshot({ path: 'shot-loading-library.png' });

await page.route('**/api/games/steel-rat/story.md', async (route) => {
  await new Promise((r) => setTimeout(r, 1800));
  await route.continue();
});

await page.locator('.lib-title').filter({ hasText: /СТАНЬ/i }).click();
await page.waitForSelector('.bookload', { timeout: 5000 });
await page.waitForTimeout(550);
await page.screenshot({ path: 'shot-book-loading-1.png' });
const loadingMid = await page.evaluate(() => ({
  status: document.querySelector('.bookload-sr')?.textContent,
  lines: [...document.querySelectorAll('.bookload-line, .bookload-raw, .bookload-bar')].map(
    (el) => el.textContent,
  ),
  hex: document.querySelector('.bookload-hex')?.textContent,
}));

await page.waitForFunction(
  () => document.querySelector('.bookload-sr')?.textContent?.includes('загружена'),
  undefined,
  { timeout: 8000 },
);
const loadingLate = await page.evaluate(() => ({
  status: document.querySelector('.bookload-sr')?.textContent,
  bar: document.querySelector('.bookload-bar')?.textContent,
  lines: [...document.querySelectorAll('.bookload-line, .bookload-bar')].map(
    (el) => el.textContent,
  ),
  hex: document.querySelector('.bookload-hex')?.textContent,
}));
await page.screenshot({ path: 'shot-book-loading-2.png' });

await page.waitForSelector('.title-line', { timeout: 12000 });
await page.waitForTimeout(300);
const gamePower = await page.evaluate(powerState);
await page.screenshot({ path: 'shot-game-after-loading.png' });

await page.getByRole('button', { name: 'Библиотека' }).click();
await page.waitForSelector('.lib-table', { timeout: 5000 });
await page.waitForTimeout(250);
const libraryAfterPower = await page.evaluate(powerState);
await page.screenshot({ path: 'shot-loading-library-after.png' });

// отмена долгой загрузки: поздний ответ не должен увести с библиотеки
await page.locator('.lib-title').filter({ hasText: /СТАНЬ/i }).click();
await page.waitForSelector('.bookload', { timeout: 5000 });
await page.keyboard.press('Escape');
await page.waitForSelector('.lib-table', { timeout: 5000 });
await page.waitForTimeout(2600);
const cancelState = await page.evaluate(() => ({
  library: Boolean(document.querySelector('.lib-table')),
  loading: Boolean(document.querySelector('.bookload')),
  game: Boolean(document.querySelector('.title-line')),
  powerDisabled: document.querySelector('.power-btn')?.disabled,
}));

const mobile = await newPage({ width: 420, height: 900 });
await mobile.goto(url);
await mobile.waitForSelector('.lib-table', { timeout: 20000 });
await mobile.route('**/api/games/cave/story.md', async (route) => {
  await new Promise((r) => setTimeout(r, 1800));
  await route.continue();
});
await mobile.keyboard.press('1');
await mobile.waitForSelector('.bookload', { timeout: 5000 });
await mobile.waitForTimeout(800);
await mobile.screenshot({ path: 'shot-book-loading-mobile.png' });
const mobileFit = await mobile.evaluate(() => {
  const content = document.querySelector('.screen-content');
  const load = document.querySelector('.bookload');
  return {
    contentBottom: content?.getBoundingClientRect().bottom,
    loadBottom: load?.getBoundingClientRect().bottom,
    scrollHeight: load?.scrollHeight,
    clientHeight: content?.clientHeight,
  };
});

const landscape = await newPage({ width: 900, height: 420 });
await landscape.goto(url);
await landscape.waitForSelector('.lib-table', { timeout: 20000 });
await landscape.route('**/api/games/cave/story.md', async (route) => {
  await new Promise((r) => setTimeout(r, 1800));
  await route.continue();
});
await landscape.keyboard.press('1');
await landscape.waitForSelector('.bookload', { timeout: 5000 });
await landscape.waitForTimeout(800);
await landscape.screenshot({ path: 'shot-book-loading-landscape.png' });

console.log(
  JSON.stringify(
    { libraryPower, loadingMid, loadingLate, gamePower, libraryAfterPower, cancelState, mobileFit, errors },
    null,
    2,
  ),
);

await browser.close();
