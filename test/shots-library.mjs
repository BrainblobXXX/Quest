import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3100/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const errors = [];

async function pageAt(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${viewport.width}x${viewport.height}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  await page.goto(url);
  await page.waitForSelector('.lib-table', { timeout: 20000 });
  await page.waitForTimeout(300);
  return page;
}

const readRows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.lib-row:not(.lib-head)')].map((row) => ({
      title: row.querySelector('.lib-title-text')?.textContent,
      genre: row.querySelector('.lib-genre')?.textContent?.replace(/\s+/g, ' ').trim(),
      type: row.querySelector('.lib-type')?.textContent?.replace(/\s+/g, ' ').trim(),
      start: row.querySelector('.lib-start')?.textContent?.trim(),
      expanded: row.querySelector('.lib-title')?.getAttribute('aria-expanded'),
    })),
  );

const page = await pageAt({ width: 1280, height: 900 });
const headers = await page.locator('.lib-head [role="columnheader"]').allTextContents();
const collapsed = await readRows(page);
await page.screenshot({ path: 'shot-library-collapsed.png' });

// раскрываем первую книгу
await page.locator('.lib-title').first().click();
await page.waitForSelector('.lib-details', { timeout: 3000 });
await page.waitForTimeout(250);
const expanded = await page.evaluate(() => ({
  author: document.querySelector('.lib-details-meta')?.textContent?.replace(/\s+/g, ' ').trim(),
  annotation: document.querySelector('.lib-annotation')?.textContent?.replace(/\s+/g, ' ').trim(),
  expanded: document.querySelector('.lib-title')?.getAttribute('aria-expanded'),
  detailsVisible: Boolean(document.querySelector('.lib-details')),
}));
await page.screenshot({ path: 'shot-library-expanded.png' });

// низкий экран: содержимое должно прокручиваться
await page.setViewportSize({ width: 1280, height: 650 });
await page.waitForTimeout(250);
const scroll = await page.evaluate(() => {
  const el = document.querySelector('.library-scroll');
  if (!el) return null;
  el.scrollTop = 200;
  return {
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    scrollTop: el.scrollTop,
    overflowY: getComputedStyle(el).overflowY,
  };
});
await page.screenshot({ path: 'shot-library-scroll.png' });

// Пробел раскрывает/сворачивает карточку, Enter запускает книгу
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(200);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Space');
await page.waitForTimeout(200);
const afterSpace1 = await page.evaluate(() => ({
  expanded: document.querySelector('.lib-title')?.getAttribute('aria-expanded'),
  load: Boolean(document.querySelector('.bookload')),
}));
await page.keyboard.press('Space');
await page.waitForTimeout(200);
const afterSpace2 = await page.evaluate(() => ({
  expanded: document.querySelector('.lib-title')?.getAttribute('aria-expanded'),
  load: Boolean(document.querySelector('.bookload')),
}));
await page.keyboard.press('Space');
await page.waitForTimeout(200);
const afterSpace3 = await page.evaluate(() => ({
  expanded: document.querySelector('.lib-title')?.getAttribute('aria-expanded'),
  load: Boolean(document.querySelector('.bookload')),
}));
await page.keyboard.press('Enter');
await page.waitForSelector('.bookload', { timeout: 5000 });
const afterEnter = await page.evaluate(() => ({
  loading: Boolean(document.querySelector('.bookload')),
  library: Boolean(document.querySelector('.lib-table')),
}));
await page.keyboard.press('Escape');
await page.waitForSelector('.lib-table', { timeout: 5000 });
await page.waitForTimeout(200);

// длинная аннотация «Крови зомби» в раскрытой карточке
await page.locator('.lib-title').last().click();
await page.waitForSelector('.lib-details', { timeout: 3000 });
await page.waitForTimeout(250);
await page.screenshot({ path: 'shot-library-expanded-zombie.png' });

// Start запускает книгу; кнопки звука в игровом экране больше нет
await page.locator('.lib-start').filter({ hasText: /СТАРТ/i }).last().click();
await page.waitForSelector('.title-line', { timeout: 20000 });
await page.waitForTimeout(250);
const game = await page.evaluate(() => ({
  heading: document.querySelector('.title-line > span:first-child')?.textContent,
  musicButtons: document.querySelectorAll('.music-btn').length,
  rawButton: Boolean(document.querySelector('.raw-btn')),
}));
await page.screenshot({ path: 'shot-library-game-no-sound.png' });

const mobile = await pageAt({ width: 420, height: 900 });
await mobile.screenshot({ path: 'shot-library-mobile-collapsed.png' });
await mobile.locator('.lib-title').first().click();
await mobile.waitForSelector('.lib-details', { timeout: 3000 });
await mobile.waitForTimeout(250);
const mobileLayout = await mobile.evaluate(() => {
  const head = document.querySelector('.lib-head');
  const scroll = document.querySelector('.library-scroll');
  return {
    headDisplay: head ? getComputedStyle(head).display : null,
    overflowY: scroll ? getComputedStyle(scroll).overflowY : null,
    scrollHeight: scroll?.scrollHeight,
    clientHeight: scroll?.clientHeight,
  };
});
await mobile.screenshot({ path: 'shot-library-mobile-expanded.png' });

const landscape = await pageAt({ width: 900, height: 420 });
await landscape.screenshot({ path: 'shot-library-landscape.png' });
const landscapeLayout = await landscape.evaluate(() => {
  const head = document.querySelector('.lib-head');
  const scroll = document.querySelector('.library-scroll');
  const table = document.querySelector('.lib-table');
  return {
    headDisplay: head ? getComputedStyle(head).display : null,
    overflowY: scroll ? getComputedStyle(scroll).overflowY : null,
    scrollHeight: scroll?.scrollHeight,
    clientHeight: scroll?.clientHeight,
    tableOverflow: table && scroll ? table.scrollWidth > scroll.clientWidth + 1 : null,
  };
});

// Enter на реальной кнопке «Старт» запускает книгу, а не раскрывает карточку
await landscape.locator('.lib-start').first().focus();
await landscape.keyboard.press('Enter');
await landscape.waitForSelector('.bookload', { timeout: 5000 });
const landscapeStart = true;

console.log(
  JSON.stringify(
    {
      headers,
      collapsed,
      expanded,
      scroll,
      afterSpace1,
      afterSpace2,
      afterSpace3,
      afterEnter,
      game,
      mobileLayout,
      landscapeLayout,
      landscapeStart,
      errors,
    },
    null,
    2,
  ),
);

await browser.close();
