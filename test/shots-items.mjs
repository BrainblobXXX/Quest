import { chromium } from 'playwright';
const url = process.env.URL ?? 'http://127.0.0.1:3136/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const openAt = async (scene, inventory) => {
  await page.evaluate(([s, inv]) => localStorage.setItem('quest:save:steel-rat', JSON.stringify({
    game: 'steel-rat', format: 'quest/1', scene: s, inventory: inv, flags: [], stats: {},
    visited: [s], updated: new Date().toISOString(),
  })), [scene, inventory]);
  await page.reload();
  await page.waitForSelector('button.list-item');
  await page.getByRole('button', { name: /Стань стальной/i }).click();
  await page.waitForTimeout(600);
};

await page.goto(url);
await page.waitForSelector('button.list-item');

await openAt('64', { sword: 1, smoke_grenades: 2, sleep_grenades: 2 });
console.log('64 с гранатами:', await page.locator('button.choice').allInnerTexts());

await openAt('64', { sword: 1 });
console.log('64 без гранат:', await page.locator('button.choice').allInnerTexts());
await page.screenshot({ path: 'shot-items.png' });

await page.getByRole('button', { name: /Гранаты кончились/i }).click();
await page.waitForTimeout(400);
console.log('после выбора:', (await page.locator('.screen-content').innerText()).split('\n')[0]);

await openAt('41', { sword: 1, smoke_grenades: 2, sleep_grenades: 2 });
await page.locator('button.choice').nth(2).click();
await page.waitForTimeout(500);
const inv = await page.evaluate(() => JSON.parse(localStorage.getItem('quest:save:steel-rat')).inventory);
console.log('инвентарь после подбора:', inv);

await browser.close();
