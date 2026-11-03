import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:3139/');
await page.waitForSelector('button.list-item');
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(700);
console.log('глава:', (await page.locator('.title-line').innerText()).split('\n')[0]);
console.log('музыка:', await page.evaluate(() => document.documentElement.dataset.track ?? 'тишина'));
await page.evaluate(() => localStorage.setItem('quest:save:steel-rat', JSON.stringify({
  game: 'steel-rat', format: 'quest/1', scene: '64', inventory: { sword: 1, smoke_grenades: 2, sleep_grenades: 2 },
  flags: [], stats: {}, visited: ['64'], updated: new Date().toISOString(),
})));
await page.reload();
await page.waitForSelector('button.list-item');
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(600);
console.log('64:', await page.locator('button.choice').allInnerTexts());
await browser.close();
