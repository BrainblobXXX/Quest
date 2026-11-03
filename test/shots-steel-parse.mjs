import { chromium } from 'playwright';
const url = process.env.URL ?? 'http://127.0.0.1:3135/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const track = () => page.evaluate(() => document.documentElement.dataset.track ?? 'тишина');

await page.goto(url);
await page.waitForSelector('button.list-item');
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(900);
console.log('пролог:', (await page.locator('.title-line').innerText()).replace(/\n/g, ' | '));
console.log('музыка:', await track());
await page.screenshot({ path: 'shot-parse-prologue.png' });

// загрузка сохранения на 232
await page.evaluate(() => localStorage.setItem('quest:save:steel-rat', JSON.stringify({
  game: 'steel-rat', format: 'quest/1', scene: '232',
  inventory: {}, flags: [], stats: {}, visited: ['232'], updated: new Date().toISOString(),
})));
await page.reload();
await page.waitForSelector('button.list-item');
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(800);
console.log('глава 232:', (await page.locator('.title-line').innerText()).split('\n')[0], '| музыка:', await track());

// сцена с иллюстрацией 42
await page.evaluate(() => localStorage.setItem('quest:save:steel-rat', JSON.stringify({
  game: 'steel-rat', format: 'quest/1', scene: '42',
  inventory: {}, flags: [], stats: {}, visited: ['42'], updated: new Date().toISOString(),
})));
await page.reload();
await page.waitForSelector('button.list-item');
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(800);
console.log('глава 42, картинка:', await page.locator('.scene-image img').count());
await page.screenshot({ path: 'shot-parse-42.png' });

await browser.close();
