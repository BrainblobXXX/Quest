import { chromium } from 'playwright';
const url = process.env.URL ?? 'http://127.0.0.1:3141/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const track = () => page.evaluate(() => document.documentElement.dataset.track ?? 'тишина');

await page.goto(url);
await page.waitForSelector('button.list-item');

const openAt = async (scene) => {
  await page.evaluate((s) => localStorage.setItem('quest:save:steel-rat', JSON.stringify({
    game: 'steel-rat', format: 'quest/1', scene: s, inventory: { sword: 1 },
    flags: [], stats: {}, visited: [s], updated: new Date().toISOString(),
  })), scene);
  await page.reload();
  await page.waitForSelector('button.list-item');
  await page.getByRole('button', { name: /Стань стальной/i }).click();
  await page.waitForTimeout(800);
};

await openAt('0');
console.log('пролог: картинка', await page.locator('.scene-image img').getAttribute('src'), '| музыка', await track());
await page.screenshot({ path: 'shot-assets-0.png' });

await openAt('2');
console.log('глава 2: картинка', await page.locator('.scene-image img').getAttribute('src'), '| музыка', await track());
await page.screenshot({ path: 'shot-assets-2.png' });

await openAt('5');
console.log('глава 5: картинка', await page.locator('.scene-image img').count(), '| музыка', await track());
await browser.close();
